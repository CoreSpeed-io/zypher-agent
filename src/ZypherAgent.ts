import { Anthropic } from '@anthropic-ai/sdk';
import type {
  Message,
  MessageParam,
  ToolResultBlockParam,
  ToolUnion,
} from '@anthropic-ai/sdk/resources/messages';
import type { Tool } from './tools';
import { 
  printMessage, 
  getCurrentUserInfo, 
  loadMessageHistory, 
  saveMessageHistory
} from './utils';
import { detectErrors } from './errorDetection';
import { getSystemPrompt } from './prompt';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_MAX_TOKENS = 8192;

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
  private _messages: MessageParam[];
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
    this.system = await getSystemPrompt(getCurrentUserInfo());
    
    // Load message history if enabled
    if (this.persistHistory) {
      this._messages = await loadMessageHistory();
    }
  }

  get messages(): MessageParam[] {
    return [...this._messages];
  }

  get tools(): Map<string, Tool> {
    return new Map(this._tools);
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

  async runTaskLoop(taskDescription: string, maxIterations: number = 25): Promise<MessageParam[]> {
    // Ensure system prompt is initialized
    if (!this.system) {
      await this.init();
    }

    let iterations = 0;
    const messages: MessageParam[] = [...this._messages];

    // Add user message
    const userMessage: MessageParam = {
      role: 'user',
      content: `<user_query>\n${taskDescription}\n</user_query>`,
    };
    messages.push(userMessage);
    printMessage(userMessage);

    while (iterations < maxIterations) {
      const response = await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: this.maxTokens,
        system: this.system,
        messages,
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

      // Add assistant response
      const assistantMessage: MessageParam = {
        role: 'assistant',
        content: response.content,
      };
      messages.push(assistantMessage);

      // Print the response
      printMessage(assistantMessage);

      if (response.stop_reason === 'tool_use') {
        // Execute tool calls
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await this.executeToolCall({
              name: block.name,
              parameters: block.input as Record<string, unknown>,
            });

            // Add tool response
            const toolMessage: MessageParam = {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                } as ToolResultBlockParam,
              ],
            };
            messages.push(toolMessage);
            printMessage(toolMessage);
          }
        }
      }
      else if (response.stop_reason === 'max_tokens') {
        // auto continue
        messages.push({
          role: 'user',
          content: 'Continue',
        });
      }
      else {
        // Check for code errors if enabled and this is the end of the conversation
        if (this.autoErrorCheck) {
          const errors = await detectErrors();
          if (errors) {
            console.log('\n🔍 Detected code errors. Asking the agent to fix them...');
            
            // Add errors as a user message
            const errorMessage: MessageParam = {
              role: 'user',
              content: `I noticed some errors in the code. Please fix these issues:\n\n${errors}\n\nPlease explain what was wrong and how you fixed it.`,
            };
            messages.push(errorMessage);
            printMessage(errorMessage);
            
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
