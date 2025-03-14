import { Anthropic } from '@anthropic-ai/sdk';
import type {
  MessageParam as AnthropicMessageParam,
  ToolResultBlockParam,
  ToolUnion,
} from '@anthropic-ai/sdk/resources/messages';
import type { Tool } from './tools';
import { printMessage, getCurrentUserInfo, loadMessageHistory, saveMessageHistory } from './utils';
import { detectErrors } from './errorDetection';
import { getSystemPrompt } from './prompt';
import { createCheckpoint, getCheckpointDetails, applyCheckpoint } from './checkpoints';
import type { Message } from './message';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Message handler function type for streaming messages
 */
export type MessageHandler = (message: Message) => void;

/**
 * Strips custom fields from MessageParam to make it compatible with Anthropic API
 *
 * @param message - The extended message parameter
 * @returns A clean message parameter for the Anthropic API
 */
function stripCustomFields(message: Message): AnthropicMessageParam {
  // Destructure to get only the standard fields
  const { role, content } = message;
  return { role, content };
}

export interface ZypherAgentConfig {
  anthropicApiKey?: string;
  model?: string;
  maxTokens?: number;
  /** Whether to load and save message history. Defaults to true. */
  persistHistory?: boolean;
  /** Whether to automatically check for code errors. Defaults to true. */
  autoErrorCheck?: boolean;
}

export class ZypherAgent {
  private readonly client: Anthropic;
  private readonly _tools: Map<string, Tool>;
  private system: string;
  private readonly maxTokens: number;
  private _messages: Message[];
  private readonly persistHistory: boolean;
  private readonly autoErrorCheck: boolean;

  constructor(config: ZypherAgentConfig = {}) {
    const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'API key is required. Provide it in config or set ANTHROPIC_API_KEY environment variable.',
      );
    }

    this.client = new Anthropic({ apiKey });
    this._tools = new Map();
    this._messages = [];
    this.system = ''; // Will be initialized in init()
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.persistHistory = config.persistHistory ?? true;
    this.autoErrorCheck = config.autoErrorCheck ?? true;
  }

  async init(): Promise<void> {
    const userInfo = await getCurrentUserInfo();
    this.system = await getSystemPrompt(userInfo);

    // Load message history if enabled
    if (this.persistHistory) {
      this._messages = await loadMessageHistory();
    }
  }

  get messages(): Message[] {
    return [...this._messages];
  }

  get tools(): Map<string, Tool> {
    return new Map(this._tools);
  }

  /**
   * Clear all messages from the agent's history
   */
  clearMessages(): void {
    this._messages = [];

    // Save updated message history if enabled
    if (this.persistHistory) {
      void saveMessageHistory(this._messages);
    }
  }

  /**
   * Get all messages from the agent's history
   * @returns Array of messages
   */
  getMessages(): Message[] {
    return [...this._messages];
  }

  /**
   * Apply a checkpoint and update the message history
   * This will discard messages beyond the checkpoint
   *
   * @param checkpointId The ID of the checkpoint to apply
   * @returns True if the checkpoint was applied successfully, false otherwise
   */
  async applyCheckpoint(checkpointId: string): Promise<boolean> {
    try {
      // Apply the checkpoint to the filesystem
      const success = await applyCheckpoint(checkpointId);

      if (!success) {
        return false;
      }

      // Update message history to discard messages beyond the checkpoint
      const checkpointIndex = this._messages.findIndex((msg) => msg.checkpointId === checkpointId);

      if (checkpointIndex !== -1) {
        // Keep messages up to but excluding the checkpoint message
        this._messages = this._messages.slice(0, checkpointIndex);

        // Save updated message history if enabled
        if (this.persistHistory) {
          await saveMessageHistory(this._messages);
        }
      }

      return true;
    } catch (error) {
      console.error(`Error applying checkpoint: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  /**
   * Process a message by adding it to the messages array and notifying handlers
   * @param message The message to process
   * @param messages The messages array to add to
   * @param messageHandler Optional message handler to notify
   */
  private processMessage(
    message: Message,
    messages: Message[],
    messageHandler?: MessageHandler,
  ): void {
    // Add message to the array
    messages.push(message);

    // Notify message handler or print to console
    if (messageHandler) {
      messageHandler(message);
    } else {
      printMessage(message);
    }
  }

  registerTool(tool: Tool): void {
    this._tools.set(tool.name, tool);
  }

  private async executeToolCall(toolCall: {
    name: string;
    parameters: Record<string, unknown>;
  }): Promise<string> {
    const tool = this._tools.get(toolCall.name);
    if (!tool) {
      return `Error: Tool '${toolCall.name}' not found`;
    }

    try {
      return await tool.execute(toolCall.parameters);
    } catch (error) {
      if (error instanceof Error) {
        return `Error executing tool '${toolCall.name}': ${error.message}`;
      }
      return `Error executing tool '${toolCall.name}': Unknown error`;
    }
  }

  async runTaskLoop(
    taskDescription: string,
    messageHandler?: MessageHandler,
    maxIterations: number = 25,
  ): Promise<Message[]> {
    // Ensure system prompt is initialized
    if (!this.system) {
      await this.init();
    }

    let iterations = 0;
    const messages: Message[] = [...this._messages];

    // Always create a checkpoint before executing the task
    const checkpointName = `Before task: ${taskDescription.substring(0, 50)}${taskDescription.length > 50 ? '...' : ''}`;
    const checkpointId = await createCheckpoint(checkpointName);
    const checkpoint = checkpointId ? await getCheckpointDetails(checkpointId) : undefined;

    // Add user message with checkpoint reference
    const userMessage: Message = {
      role: 'user',
      content: `<user_query>\n${taskDescription}\n</user_query>`,
      checkpointId,
      checkpoint,
      timestamp: new Date(), // current timestamp
    };
    this.processMessage(userMessage, messages, messageHandler);

    while (iterations < maxIterations) {
      const response = await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: this.maxTokens,
        system: this.system,
        messages: messages.map(stripCustomFields), // Strip custom fields before sending to Claude API
        tools: Array.from(this._tools.values()).map(
          (tool): ToolUnion => ({
            name: tool.name,
            description: tool.description,
            input_schema: {
              type: 'object',
              properties: tool.parameters.properties,
              required: tool.parameters.required,
            },
          }),
        ),
      });

      // Process the response
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
      };
      this.processMessage(assistantMessage, messages, messageHandler);

      // Process tool calls if any
      if (response.stop_reason === 'tool_use') {
        // Execute tool calls
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await this.executeToolCall({
              name: block.name,
              parameters: block.input as Record<string, unknown>,
            });

            // Add tool response
            const toolMessage: Message = {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                } as ToolResultBlockParam,
              ],
              timestamp: new Date(),
            };
            this.processMessage(toolMessage, messages, messageHandler);
          }
        }
      } else if (response.stop_reason === 'max_tokens') {
        // auto continue
        const continueMessage: Message = {
          role: 'user',
          content: 'Continue',
          timestamp: new Date(),
        };
        this.processMessage(continueMessage, messages, messageHandler);
      } else {
        // Check for code errors if enabled and this is the end of the conversation
        if (this.autoErrorCheck) {
          const errors = await detectErrors();
          if (errors) {
            console.log('\n🔍 Detected code errors. Asking the agent to fix them...');

            // Add errors as a user message
            const errorMessage: Message = {
              role: 'user',
              content: `I noticed some errors in the code. Please fix these issues:\n\n${errors}\n\nPlease explain what was wrong and how you fixed it.`,
              timestamp: new Date(),
            };
            this.processMessage(errorMessage, messages, messageHandler);

            // Continue the loop to let the agent fix the errors
            iterations++;
            continue;
          }
        }

        // No errors or error check disabled, exit the loop
        break;
      }

      iterations++;
    }

    this._messages = messages as Message[];

    // Save updated message history if enabled
    if (this.persistHistory) {
      await saveMessageHistory(this._messages);
    }

    return this.messages;
  }
}
