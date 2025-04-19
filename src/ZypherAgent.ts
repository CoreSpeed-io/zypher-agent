// Tell TypeScript and the package to use the global fetch instead of node-fetch.
// Note, despite the name, this does not add any polyfills, but expects them to be provided if needed.
//
// node-fetch does not support HTTP/2, SSE suffer from hanging issue when using HTTP/1.1.
// To provide a better experience (faster responses from the Anthropic API), we MUST use the global fetch for HTTP/2.
import "@anthropic-ai/sdk/shims/web";
import {
  formatError,
  getCurrentUserInfo,
  loadMessageHistory,
  printMessage,
  saveMessageHistory,
} from "./utils/index.ts";
import { detectErrors } from "./errorDetection/index.ts";
import { getSystemPrompt } from "./prompt.ts";
import {
  applyCheckpoint,
  createCheckpoint,
  getCheckpointDetails,
} from "./checkpoints.ts";
import type { Message } from "./message.ts";
import { McpServerManager } from "./mcp/McpServerManager.ts";
import { Anthropic } from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-3-7-sonnet-20250219";
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

  /**
   * Called when a task is cancelled
   * @param reason The reason for cancellation
   */
  onCancelled?: (reason: "user" | "timeout") => void;
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
  /** Maximum allowed time for a task in milliseconds before it's automatically cancelled. Default is 1 minute (60000ms). Set to 0 to disable. */
  taskTimeoutMs?: number;
}

export class ZypherAgent {
  private readonly client: Anthropic;
  private system: Anthropic.TextBlockParam[];
  private readonly maxTokens: number;
  private _messages: Message[];
  private readonly persistHistory: boolean;
  private readonly autoErrorCheck: boolean;
  private readonly enablePromptCaching: boolean;
  private readonly userId?: string;
  private readonly _model: string;
  private readonly mcpServerManager: McpServerManager;
  private readonly _taskTimeoutMs: number;

  // Task execution state
  private _isTaskRunning = false;
  private _currentAbortController: AbortController | null = null;
  private _currentStreamHandler: StreamHandler | undefined;
  private _taskTimeoutId: number | null = null;
  private _cancellationReason: "user" | "timeout" | null = null;

  constructor(
    config: ZypherAgentConfig = {},
    mcpServerManager: McpServerManager,
  ) {
    const apiKey = config.anthropicApiKey ?? Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error(
        "API key is required. Provide it in config or set ANTHROPIC_API_KEY environment variable.",
      );
    }

    const baseUrl = config.baseUrl ?? Deno.env.get("ANTHROPIC_BASE_URL");
    const userId = config.userId ?? Deno.env.get("ZYPHER_USER_ID");

    this.client = new Anthropic({
      apiKey,
      ...(baseUrl && { baseURL: baseUrl }),
    });
    this._messages = [];
    this.system = []; // Will be initialized in init()
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.persistHistory = config.persistHistory ?? true;
    this.autoErrorCheck = config.autoErrorCheck ?? true;
    this.enablePromptCaching = config.enablePromptCaching ?? true;
    this.userId = userId;
    this._model = config.model ?? DEFAULT_MODEL;
    this.mcpServerManager = mcpServerManager;
    // Default timeout is 1 minute, 0 = disabled
    this._taskTimeoutMs = config.taskTimeoutMs ?? 60000;
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

  /**
   * Get the current model being used by the agent
   */
  get model(): string {
    return this._model;
  }

  /**
   * Get the configured task timeout in milliseconds
   */
  get taskTimeoutMs(): number {
    return this._taskTimeoutMs;
  }

  /**
   * Check if a task is currently running
   */
  get isTaskRunning(): boolean {
    return this._isTaskRunning;
  }

  /**
   * Get the reason why the task was cancelled, if available
   */
  get cancellationReason(): "user" | "timeout" | null {
    return this._cancellationReason;
  }

  /**
   * Cancel the current running task, if any
   * @param reason The reason for cancellation, defaults to "user"
   * @returns True if a task was cancelled, false if no task was running
   */
  cancelTask(reason: "user" | "timeout" = "user"): boolean {
    if (!this._isTaskRunning || !this._currentAbortController) {
      return false;
    }

    // Set cancellation reason
    this._cancellationReason = reason;

    // Abort any pending fetch requests
    this._currentAbortController.abort();

    // Notify via stream handler if available
    if (this._currentStreamHandler?.onCancelled) {
      this._currentStreamHandler.onCancelled(reason);
    }

    // Clear task timeout if it exists
    if (this._taskTimeoutId !== null) {
      clearTimeout(this._taskTimeoutId);
      this._taskTimeoutId = null;
    }

    // Reset task state
    this._isTaskRunning = false;
    this._currentAbortController = null;
    this._currentStreamHandler = undefined;

    console.log(`🛑 Task cancelled (reason: ${reason})`);
    return true;
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

  private async executeToolCall(toolCall: {
    name: string;
    parameters: Record<string, unknown>;
  }): Promise<string> {
    // Check if task has been cancelled
    if (!this._isTaskRunning) {
      return "Task was cancelled";
    }

    const tool = this.mcpServerManager.getTool(toolCall.name);
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
  ): Anthropic.MessageParam => {
    // Destructure to get only the standard fields
    const { role, content } = message;

    // For string content, convert to array format
    let contentArray = typeof content === "string"
      ? [{ type: "text" as const, text: content } as Anthropic.TextBlockParam]
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
        } as Anthropic.ContentBlockParam,
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
   * Cancellation:
   * - Tasks can be cancelled at any time using cancelTask()
   * - Cancellation will properly clean up resources and stop API requests
   * - StreamHandler will be notified of cancellation via onCancelled
   *
   * @param taskDescription The text description of the task to perform
   * @param streamHandler Handler for real-time content updates and complete messages
   * @param imageAttachments Optional array of image attachments in Claude's format
   * @param maxIterations Maximum number of iterations to run (default: 25)
   * @returns Array of messages after task completion, or empty array if cancelled
   */
  async runTaskWithStreaming(
    taskDescription: string,
    streamHandler?: StreamHandler,
    imageAttachments?: ImageAttachment[],
    maxIterations = 25,
  ): Promise<Message[]> {
    // Check if a task is already running
    if (this._isTaskRunning) {
      throw new Error(
        "A task is already running. Cancel it first or wait for it to complete.",
      );
    }

    // Reset cancellation reason
    this._cancellationReason = null;

    // Set task running flag and create a new abort controller
    this._isTaskRunning = true;
    this._currentAbortController = new AbortController();
    this._currentStreamHandler = streamHandler;

    // Set up task timeout if enabled
    if (this._taskTimeoutMs > 0) {
      this._taskTimeoutId = setTimeout(() => {
        console.log(`🕒 Task timed out after ${this._taskTimeoutMs}ms`);
        if (this._isTaskRunning) {
          this.cancelTask("timeout");
        }
      }, this._taskTimeoutMs) as unknown as number;
    }

    try {
      // Ensure system prompt is initialized
      if (!this.system.length) {
        await this.init();
      }

      let iterations = 0;
      const messages: Message[] = [...this._messages];

      // Always create a checkpoint before executing the task
      const checkpointName = `Before task: ${taskDescription.substring(0, 50)}${
        taskDescription.length > 50 ? "..." : ""
      }`;
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
          } as Anthropic.ImageBlockParam;
        })
        : [];

      const messageContent: Anthropic.ContentBlockParam[] = [
        ...imageBlocks,
        {
          type: "text",
          text: `<user_query>\n${taskDescription}\n</user_query>`,
        } as Anthropic.TextBlockParam,
      ];

      // Add user message with checkpoint reference
      const userMessage: Message = {
        role: "user",
        content: messageContent,
        checkpointId,
        checkpoint,
        timestamp: new Date(), // current timestamp
      };
      this.processMessage(userMessage, messages, streamHandler?.onMessage);

      const toolCalls = Array.from(
        this.mcpServerManager.getAllTools().values(),
      ).map(
        (tool, index, tools): Anthropic.ToolUnion => ({
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

      while (iterations < maxIterations && this._isTaskRunning) {
        // Check for cancellation
        if (!this._isTaskRunning) {
          return [];
        }

        let isFirstChunk = true;
        let currentToolName: string | null = null;

        // Create a stream with event handlers and pass the abort signal for cancellation
        const signal = this._currentAbortController.signal;
        const stream = this.client.messages
          .stream({
            model: this._model,
            max_tokens: this.maxTokens,
            system: this.system,
            messages: messages.map((msg, index) =>
              this.formatMessageForApi(msg, index === messages.length - 1)
            ),
            tools: toolCalls,
            ...(this.userId && { metadata: { user_id: this.userId } }),
          }, { signal })
          .on("text", (textDelta) => {
            // Call stream handler for content
            if (streamHandler?.onContent && textDelta) {
              streamHandler.onContent(textDelta, isFirstChunk);
              isFirstChunk = false;
            }
          })
          .on("streamEvent", (event: Anthropic.MessageStreamEvent) => {
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

        try {
          // Check if the task was cancelled during stream setup
          if (!this._isTaskRunning) {
            return [];
          }

          // Wait for the final message
          const finalMessage = await stream.finalMessage();

          // Create the assistant message using the complete content from finalMessage
          const assistantMessage: Message = {
            role: "assistant",
            content: finalMessage.content,
            timestamp: new Date(),
          };
          this.processMessage(
            assistantMessage,
            messages,
            streamHandler?.onMessage,
          );

          // Process tool calls if any
          if (finalMessage.stop_reason === "tool_use") {
            // Execute tool calls
            for (const block of finalMessage.content) {
              // Check for cancellation before processing each tool call
              if (!this._isTaskRunning) {
                return [];
              }

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
                    } as Anthropic.ToolResultBlockParam,
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
              // Check for cancellation before error detection
              if (!this._isTaskRunning) {
                return [];
              }

              const errors = await detectErrors();
              if (errors) {
                console.log(
                  "\n🔍 Detected code errors. Asking the agent to fix them...",
                );

                // Add errors as a user message
                const errorMessage: Message = {
                  role: "user",
                  content:
                    `I noticed some errors in the code. Please fix these issues:\n\n${errors}\n\nPlease explain what was wrong and how you fixed it.`,
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
        } catch (error) {
          // If the task was cancelled (aborted), just return
          if (
            this._cancellationReason !== null ||
            (error instanceof Error &&
              (error.name === "AbortError" ||
                error.message.includes("aborted") ||
                error.message.includes("abort")))
          ) {
            return [];
          }

          // For other errors, rethrow
          throw error;
        }

        iterations++;
      }

      // If we've been cancelled during processing, return empty array
      if (!this._isTaskRunning) {
        return [];
      }

      this._messages = messages;

      // Save updated message history if enabled
      if (this.persistHistory) {
        await saveMessageHistory(this._messages);
      }

      return this.messages;
    } finally {
      // Clean up resources
      this._isTaskRunning = false;
      this._currentAbortController = null;
      this._currentStreamHandler = undefined;

      // Clear task timeout if it exists
      if (this._taskTimeoutId !== null) {
        clearTimeout(this._taskTimeoutId);
        this._taskTimeoutId = null;
      }
    }
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
  runTaskLoop(
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
