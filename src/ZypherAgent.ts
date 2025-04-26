// Tell TypeScript and the package to use the global fetch instead of node-fetch.
// Note, despite the name, this does not add any polyfills, but expects them to be provided if needed.
//
// node-fetch does not support HTTP/2, SSE suffer from hanging issue when using HTTP/1.1.
// To provide a better experience (faster responses from the Anthropic API), we MUST use the global fetch for HTTP/2.
import "@anthropic-ai/sdk/shims/web";
import {
  AbortError,
  formatError,
  getCurrentUserInfo,
  isAbortError,
  loadMessageHistory,
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

/**
 * Custom error class for task concurrency issues
 * Thrown when attempting to run a new task while another task is already running
 */
export class TaskConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskConcurrencyError";
  }
}

const DEFAULT_MODEL = "claude-3-7-sonnet-20250219";
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_MAX_ITERATIONS = 25;

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
  readonly #client: Anthropic;
  readonly #maxTokens: number;
  readonly #persistHistory: boolean;
  readonly #autoErrorCheck: boolean;
  readonly #enablePromptCaching: boolean;
  readonly #userId?: string;
  readonly #model: string;
  readonly #mcpServerManager: McpServerManager;
  readonly #taskTimeoutMs: number;

  #messages: Message[];
  #system: Anthropic.TextBlockParam[];

  // Task execution state
  #isTaskRunning: boolean = false;

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

    this.#client = new Anthropic({
      apiKey,
      ...(baseUrl && { baseURL: baseUrl }),
    });
    this.#messages = [];
    this.#system = []; // Will be initialized in init()
    this.#maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.#persistHistory = config.persistHistory ?? true;
    this.#autoErrorCheck = config.autoErrorCheck ?? true;
    this.#enablePromptCaching = config.enablePromptCaching ?? true;
    this.#userId = userId;
    this.#model = config.model ?? DEFAULT_MODEL;
    this.#mcpServerManager = mcpServerManager;
    // Default timeout is 5 minutes, 0 = disabled
    this.#taskTimeoutMs = config.taskTimeoutMs ?? 300000;
  }

  async init(): Promise<void> {
    const userInfo = getCurrentUserInfo();
    const systemPromptText = await getSystemPrompt(userInfo);
    // Convert system prompt to content blocks
    // cache the main system prompt as it's large and reusable
    this.#system = [
      {
        type: "text",
        text: systemPromptText,
        ...(this.#enablePromptCaching && {
          cache_control: { type: "ephemeral" },
        }),
      },
    ];

    // Load message history if enabled
    if (this.#persistHistory) {
      this.#messages = await loadMessageHistory();
    }
  }

  /**
   * Get all messages from the agent's history
   * @returns Array of messages
   */
  get messages(): Message[] {
    return [...this.#messages];
  }

  /**
   * Get the current model being used by the agent
   */
  get model(): string {
    return this.#model;
  }

  /**
   * Get the configured task timeout in milliseconds
   */
  get taskTimeoutMs(): number {
    return this.#taskTimeoutMs;
  }

  /**
   * Check if a task is currently running
   */
  get isTaskRunning(): boolean {
    return this.#isTaskRunning;
  }

  /**
   * Clear all messages from the agent's history
   */
  clearMessages(): void {
    this.#messages = [];

    // Save updated message history if enabled
    if (this.#persistHistory) {
      void saveMessageHistory(this.#messages);
    }
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
      const checkpointIndex = this.#messages.findIndex(
        (msg) => msg.checkpointId === checkpointId,
      );

      if (checkpointIndex !== -1) {
        // Keep messages up to but excluding the checkpoint message
        this.#messages = this.#messages.slice(0, checkpointIndex);

        // Save updated message history if enabled
        if (this.#persistHistory) {
          await saveMessageHistory(this.#messages);
        }
      }

      return true;
    } catch (error) {
      console.error(`Error applying checkpoint: ${formatError(error)}`);
      return false;
    }
  }

  async #executeToolCall(toolCall: {
    name: string;
    parameters: Record<string, unknown>;
    options: { signal?: AbortSignal };
  }): Promise<string> {
    const tool = this.#mcpServerManager.getTool(toolCall.name);
    if (!tool) {
      return `Error: Tool '${toolCall.name}' not found`;
    }

    try {
      // TODO: support abort signal in tool execution
      return await tool.execute(toolCall.parameters);
    } catch (error) {
      return `Error executing tool '${toolCall.name}': ${formatError(error)}`;
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
  #formatMessageForApi(
    message: Message,
    isLastMessage: boolean,
  ): Anthropic.MessageParam {
    // Destructure to get only the standard fields
    const { role, content } = message;

    // For string content, convert to array format
    let contentArray = typeof content === "string"
      ? [{ type: "text" as const, text: content } as Anthropic.TextBlockParam]
      : content; // Use original array for non-last messages

    // Add cache control to the last block of the last message
    if (isLastMessage && this.#enablePromptCaching && contentArray.length > 0) {
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
  }

  /**
   * Atomically checks if a task is running and sets the flag if it's not
   * This is a critical section that must be executed synchronously (not async)
   * to ensure atomic "check-and-set" semantics
   *
   * This method should only be called by runTaskWithStreaming
   *
   * @returns true if the flag was successfully set (no task was running),
   *          false if a task is already running
   */
  #checkAndSetTaskRunning(): boolean {
    // This critical section is atomic because JavaScript is single-threaded
    // and this method contains no async operations
    if (this.#isTaskRunning) {
      return false;
    }

    // Set the flag
    this.#isTaskRunning = true;
    return true;
  }

  /**
   * Run a task with real time progress updates
   *
   * This method provides real-time streaming of incremental content updates as they're generated,
   * allowing for character-by-character updates as Claude produces them. This enables
   * a more responsive user experience with immediate feedback.
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
   * @param options Additional options:
   *   - maxIterations: Maximum number of iterations to run (default: 25)
   *   - signal: AbortSignal for cancellation from the caller
   * @returns Array of messages after task completion, or return as is if cancelled
   * @throws {TaskConcurrencyError} If a task is already running
   */
  async runTaskWithStreaming(
    taskDescription: string,
    streamHandler?: StreamHandler,
    imageAttachments?: ImageAttachment[],
    options?: {
      maxIterations?: number;
      signal?: AbortSignal;
    },
  ): Promise<Message[]> {
    // Use default maxIterations if not provided
    const maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    if (!this.#checkAndSetTaskRunning()) {
      throw new TaskConcurrencyError(
        "Cannot run multiple tasks concurrently. A task is already running.",
      );
    }

    const timeoutController = new AbortController();

    // Create a composite signal that aborts if either the caller's signal or our timeout signal aborts
    const signal = options?.signal
      ? AbortSignal.any([options.signal, timeoutController.signal])
      : timeoutController.signal;

    // Set up task timeout if enabled
    let timeoutId: number | null = null;
    if (this.#taskTimeoutMs > 0) {
      timeoutId = setTimeout(
        () => {
          console.log(`🕒 Task timed out after ${this.#taskTimeoutMs}ms`);
          timeoutController.abort();
        },
        this.#taskTimeoutMs,
      );
    }

    try {
      // Ensure system prompt is initialized
      if (!this.#system.length) {
        await this.init();
      }

      let iterations = 0;

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
      this.#messages.push(userMessage);
      streamHandler?.onMessage?.(userMessage);

      const toolCalls = Array.from(
        this.#mcpServerManager.getAllTools().values(),
      ).map(
        (tool, index, tools): Anthropic.ToolUnion => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
          // Only add cache control to the last tool as it acts as a breakpoint
          ...(this.#enablePromptCaching &&
            index === tools.length - 1 && {
            cache_control: { type: "ephemeral" },
          }),
        }),
      );

      while (iterations < maxIterations) {
        // Check for abort signal early
        if (signal.aborted) {
          throw new AbortError("Task aborted");
        }
        let isFirstChunk = true;
        let currentToolName: string | null = null;

        // Create a stream with event handlers and pass the composite abort signal for cancellation
        const stream = this.#client.messages
          .stream({
            model: this.#model,
            max_tokens: this.#maxTokens,
            system: this.#system,
            messages: this.#messages.map((msg: Message, index: number) =>
              this.#formatMessageForApi(
                msg,
                index === this.#messages.length - 1,
              )
            ),
            tools: toolCalls,
            ...(this.#userId && { metadata: { user_id: this.#userId } }),
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

        // Wait for the final message
        const finalMessage = await stream.finalMessage();

        // Create the assistant message using the complete content from finalMessage
        const assistantMessage: Message = {
          role: "assistant",
          content: finalMessage.content,
          timestamp: new Date(),
        };
        this.#messages.push(assistantMessage);
        streamHandler?.onMessage?.(assistantMessage);

        // Check for cancellation
        if (signal.aborted) {
          throw new AbortError("Task aborted");
        }

        // Process tool calls if any
        if (finalMessage.stop_reason === "tool_use") {
          // Execute tool calls
          for (const block of finalMessage.content) {
            if (block.type === "tool_use") {
              const result = await this.#executeToolCall({
                name: block.name,
                parameters: block.input as Record<string, unknown>,
                options: { signal },
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
              this.#messages.push(toolMessage);
              streamHandler?.onMessage?.(toolMessage);
            }
          }
        } else if (finalMessage.stop_reason === "max_tokens") {
          // auto continue
          const continueMessage: Message = {
            role: "user",
            content: "Continue",
            timestamp: new Date(),
          };
          this.#messages.push(continueMessage);
          streamHandler?.onMessage?.(continueMessage);
        } else {
          // Check for code errors if enabled and this is the end of the conversation
          if (this.#autoErrorCheck) {
            const errors = await detectErrors({ signal });
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
              this.#messages.push(errorMessage);
              streamHandler?.onMessage?.(errorMessage);

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

      // Save updated message history if enabled
      if (this.#persistHistory) {
        await saveMessageHistory(this.#messages);
      }

      return this.messages;
    } catch (error) {
      if (isAbortError(error)) {
        console.log(formatError(error));
        console.log("🛑 Task aborted.");

        if (this.#persistHistory) {
          await saveMessageHistory(this.#messages);
        }

        return this.messages;
      }

      console.error(formatError(error));

      throw error;
    } finally {
      // Clean up resources
      this.#isTaskRunning = false;

      // Clear task timeout if it exists
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }
}
