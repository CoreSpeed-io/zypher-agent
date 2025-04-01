import { Anthropic } from "@anthropic-ai/sdk";
import type {
  MessageParam as AnthropicMessageParam,
  ToolResultBlockParam,
  ToolUnion,
  TextBlockParam,
  ContentBlockParam,
  ImageBlockParam,
  Base64ImageSource,
} from "@anthropic-ai/sdk/resources/messages";
import type { Tool } from "./tools";
import {
  printMessage,
  getCurrentUserInfo,
  loadMessageHistory,
  saveMessageHistory,
  formatError,
} from "./utils";
import { detectErrors } from "./errorDetection";
import { getSystemPrompt } from "./prompt";
import {
  createCheckpoint,
  getCheckpointDetails,
  applyCheckpoint,
} from "./checkpoints";
import type { Message } from "./message";

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Handler for receiving complete messages
 */
export type MessageHandler = (message: Message) => void;

/**
 * Handler for streaming content and events
 */
export interface StreamHandler {
  /**
   * Called when new content is streamed
   * @param content The text content being streamed
   * @param isFirstChunk Whether this is the first chunk of content
   */
  onContent?: (content: string, isFirstChunk: boolean) => void;

  /**
   * Called when a complete message is available
   * @param message The complete message that was just processed
   */
  onMessage?: (message: Message) => void;

  /**
   * Called when tool use updates are available
   * @param name Tool name being used
   * @param partialInput Partial input data (JSON string fragment)
   */
  onToolUse?: (name: string, partialInput: string) => void;
}

export interface ImageAttachment {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
}

export interface ZypherAgentConfig {
  anthropicApiKey?: string;
  /** Base URL for the Anthropic API. Defaults to Anthropic's production API. */
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  /** Whether to load and save message history. Defaults to true. */
  persistHistory?: boolean;
  /** Whether to automatically check for code errors. Defaults to true. */
  autoErrorCheck?: boolean;
  /** Whether to enable prompt caching. Defaults to true. */
  enablePromptCaching?: boolean;
  /** Unique identifier for tracking user-specific usage history */
  userId?: string;
}

export class ZypherAgent {
  private readonly client: Anthropic;
  private readonly _tools: Map<string, Tool>;
  private system: TextBlockParam[];
  private readonly maxTokens: number;
  private _messages: Message[];
  private readonly persistHistory: boolean;
  private readonly autoErrorCheck: boolean;
  private readonly enablePromptCaching: boolean;
  private readonly userId?: string;
  private readonly model: string;

  constructor(config: ZypherAgentConfig = {}) {
    const apiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "API key is required. Provide it in config or set ANTHROPIC_API_KEY environment variable.",
      );
    }

    const baseUrl = config.baseUrl ?? process.env.ANTHROPIC_BASE_URL;
    const userId = config.userId ?? process.env.ZYPHER_USER_ID;

    this.client = new Anthropic({
      apiKey,
      ...(baseUrl && { baseURL: baseUrl }),
    });
    this._tools = new Map();
    this._messages = [];
    this.system = []; // Will be initialized in init()
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.persistHistory = config.persistHistory ?? true;
    this.autoErrorCheck = config.autoErrorCheck ?? true;
    this.enablePromptCaching = config.enablePromptCaching ?? true;
    this.userId = userId;
    this.model = config.model ?? DEFAULT_MODEL;
  }

  async init(): Promise<void> {
    const userInfo = getCurrentUserInfo();
    const systemPromptText = await getSystemPrompt(userInfo);

    // Convert system prompt to content blocks
    // cache the main system prompt as it's large and reusable
    this.system = [
      {
        type: "text",
        text: systemPromptText,
        ...(this.enablePromptCaching && {
          cache_control: { type: "ephemeral" },
        }),
      },
    ];

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
      await applyCheckpoint(checkpointId);

      // Update message history to discard messages beyond the checkpoint
      const checkpointIndex = this._messages.findIndex(
        (msg) => msg.checkpointId === checkpointId,
      );

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
      console.error(`Error applying checkpoint: ${formatError(error)}`);
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

  /**
   * Formats a message for the Anthropic API, converting content to blocks and adding cache control
   * for incremental caching of conversation history.
   *
   * @param message - The extended message parameter
   * @param isLastMessage - Whether this is the last message in the turn
   * @returns A clean message parameter for the Anthropic API
   */
  private formatMessageForApi = (
    message: Message,
    isLastMessage: boolean,
  ): AnthropicMessageParam => {
    // Destructure to get only the standard fields
    const { role, content } = message;

    // For string content, convert to array format
    let contentArray =
      typeof content === "string"
        ? [{ type: "text" as const, text: content } as TextBlockParam]
        : content; // Use original array for non-last messages

    // Add cache control to the last block of the last message
    if (isLastMessage && this.enablePromptCaching && contentArray.length > 0) {
      // Only create new array for the last message to avoid mutating the original array
      contentArray = [
        ...contentArray.slice(0, -1), // Keep all but the last block
        // inject cache control to the last block
        // refer to https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#continuing-a-multi-turn-conversation
        {
          ...contentArray[contentArray.length - 1],
          cache_control: { type: "ephemeral" },
        } as ContentBlockParam,
      ];
    }

    return { role, content: contentArray };
  };

  /**
   * Run a task with streaming support (primary implementation)
   *
   * This method provides real-time streaming of incremental content updates as they're generated,
   * allowing for character-by-character updates as Claude produces them. This enables
   * a more responsive user experience with immediate feedback.
   *
   * In contrast to runTaskLoop, this method:
   * - Streams individual text fragments as they become available (not just complete messages)
   * - Provides real-time updates via onContent callback
   * - Still delivers complete messages via onMessage when they're done
   * - Supports image attachments in Claude's native format
   *
   * Image handling:
   * - Images are passed as an array of base64-encoded data with proper MIME types
   * - Each image should follow Claude's format: { type: "image", source: { type: "base64", media_type: string, data: string } }
   * - Images are automatically included in the message content along with the text
   * - The API will optimize images to stay within Claude's token limits
   *
   * Streaming behavior:
   * - Content is streamed in real-time as it's generated
   * - Tool usage is streamed as tools are invoked
   * - Complete messages are delivered when available
   * - Errors and code fixes are handled automatically
   *
   * @param taskDescription The text description of the task to perform
   * @param streamHandler Handler for real-time content updates and complete messages
   * @param imageAttachments Optional array of image attachments in Claude's format
   * @param maxIterations Maximum number of iterations to run (default: 25)
   * @returns Array of messages after task completion
   */
  async runTaskWithStreaming(
    taskDescription: string,
    streamHandler?: StreamHandler,
    imageAttachments?: ImageAttachment[],
    maxIterations = 25,
  ): Promise<Message[]> {
    // Ensure system prompt is initialized
    if (!this.system.length) {
      await this.init();
    }

    let iterations = 0;
    const messages: Message[] = [...this._messages];

    // Always create a checkpoint before executing the task
    const checkpointName = `Before task: ${taskDescription.substring(0, 50)}${taskDescription.length > 50 ? "..." : ""}`;
    const checkpointId = await createCheckpoint(checkpointName);
    const checkpoint = checkpointId
      ? await getCheckpointDetails(checkpointId)
      : undefined;

    // Prepare message content
    const imageBlocks = imageAttachments
      ? imageAttachments.map((img) => {
          return {
            type: "image",
            source: img.source,
          } as ImageBlockParam;
        })
      : [];

    const messageContent: ContentBlockParam[] = [
      ...imageBlocks,
      {
        type: "text",
        text: `<user_query>\n${taskDescription}\n</user_query>`,
      } as TextBlockParam,
    ];

    // Add user message with checkpoint reference
    const userMessage: Message = {
      role: "user",
      content: messageContent,
      checkpointId,
      checkpoint,
      timestamp: new Date(),
    };
    this.processMessage(userMessage, messages, streamHandler?.onMessage);

    const toolCalls = Array.from(this._tools.values()).map(
      (tool, index, tools): ToolUnion => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
        // Only add cache control to the last tool as it acts as a breakpoint
        ...(this.enablePromptCaching &&
          index === tools.length - 1 && {
            cache_control: { type: "ephemeral" },
          }),
      }),
    );

    while (iterations < maxIterations) {
      let isFirstChunk = true;
      let currentToolName: string | null = null;

      // Create a stream with event handlers
      const stream = this.client.messages
        .stream({
          model: this.model,
          max_tokens: this.maxTokens,
          system: this.system,
          messages: messages.map((msg, index) =>
            this.formatMessageForApi(msg, index === messages.length - 1),
          ),
          tools: toolCalls,
          ...(this.userId && { metadata: { user_id: this.userId } }),
        })
        .on("text", (textDelta) => {
          // Call stream handler for content
          if (streamHandler?.onContent && textDelta) {
            streamHandler.onContent(textDelta, isFirstChunk);
            isFirstChunk = false;
          }
        })
        .on("streamEvent", (event) => {
          // Detect tool use at the start of a content block
          if (
            event.type === "content_block_start" &&
            event.content_block?.type === "tool_use" &&
            streamHandler?.onToolUse
          ) {
            // Store the tool name for subsequent inputJson events
            currentToolName = event.content_block.name;
            // Send the initial tool use notification with the tool name
            streamHandler.onToolUse(currentToolName, "");
          }
        })
        .on("inputJson", (partialJson) => {
          // Send updates whenever we have new partial JSON for a tool
          if (partialJson && streamHandler?.onToolUse && currentToolName) {
            streamHandler.onToolUse(currentToolName, partialJson);
          }
        });

      // Wait for the final message
      const finalMessage = await stream.finalMessage();

      // Create the assistant message using the complete content from finalMessage
      const assistantMessage: Message = {
        role: "assistant",
        content: finalMessage.content,
        timestamp: new Date(),
      };
      this.processMessage(assistantMessage, messages, streamHandler?.onMessage);

      // Process tool calls if any
      if (finalMessage.stop_reason === "tool_use") {
        // Execute tool calls
        for (const block of finalMessage.content) {
          if (block.type === "tool_use") {
            const result = await this.executeToolCall({
              name: block.name,
              parameters: block.input as Record<string, unknown>,
            });

            // Add tool response
            const toolMessage: Message = {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: result,
                } as ToolResultBlockParam,
              ],
              timestamp: new Date(),
            };
            this.processMessage(
              toolMessage,
              messages,
              streamHandler?.onMessage,
            );
          }
        }
      } else if (finalMessage.stop_reason === "max_tokens") {
        // auto continue
        const continueMessage: Message = {
          role: "user",
          content: "Continue",
          timestamp: new Date(),
        };
        this.processMessage(
          continueMessage,
          messages,
          streamHandler?.onMessage,
        );
      } else {
        // Check for code errors if enabled and this is the end of the conversation
        if (this.autoErrorCheck) {
          const errors = await detectErrors();
          if (errors) {
            console.log(
              "\n🔍 Detected code errors. Asking the agent to fix them...",
            );

            // Add errors as a user message
            const errorMessage: Message = {
              role: "user",
              content: `I noticed some errors in the code. Please fix these issues:\n\n${errors}\n\nPlease explain what was wrong and how you fixed it.`,
              timestamp: new Date(),
            };
            this.processMessage(
              errorMessage,
              messages,
              streamHandler?.onMessage,
            );

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

    this._messages = messages;

    // Save updated message history if enabled
    if (this.persistHistory) {
      await saveMessageHistory(this._messages);
    }

    return this.messages;
  }

  /**
   * Run a task with the agent (non-streaming version for backward compatibility)
   *
   * This method only provides completed messages, not real-time content updates.
   * It's a compatibility wrapper around runTaskWithStreaming that adapts the older
   * MessageHandler interface to the newer StreamHandler interface.
   *
   * Unlike runTaskWithStreaming, this method:
   * - Does NOT stream individual text fragments as they become available
   * - Only delivers complete messages once they're fully generated
   * - Has no concept of partial content updates
   *
   * For new code that needs real-time content updates, use runTaskWithStreaming directly.
   *
   * @param taskDescription The task description
   * @param messageHandler Handler for complete messages only
   * @param maxIterations Maximum number of iterations to run
   * @returns Array of messages after task completion
   */
  async runTaskLoop(
    taskDescription: string,
    messageHandler?: MessageHandler,
    maxIterations = 25,
  ): Promise<Message[]> {
    // Create a streamHandler adapter that delegates to the messageHandler
    let streamHandler: StreamHandler | undefined;

    if (messageHandler) {
      // Create an adapter that forwards messages to the messageHandler
      streamHandler = {
        // We don't need content streaming for backward compatibility
        onMessage: messageHandler,
      };
    }

    // Call the streaming version with our adapter and return its messages
    return this.runTaskWithStreaming(
      taskDescription,
      streamHandler,
      undefined,
      maxIterations,
    );
  }
}
