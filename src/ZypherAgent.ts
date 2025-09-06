import {
  getCurrentUserInfo,
  getZypherDir,
  loadMessageHistory,
  saveMessageHistory,
} from "./utils/mod.ts";
import { getSystemPrompt } from "./prompt.ts";
import {
  applyCheckpoint,
  type Checkpoint,
  createCheckpoint,
  getCheckpointDetails,
} from "./checkpoints.ts";
import type { ContentBlock, FileAttachment, Message } from "./message.ts";
import type { McpServerManager } from "./mcp/McpServerManager.ts";
import type { StorageService } from "./storage/StorageService.ts";
import { Completer } from "./utils/mod.ts";
import {
  AbortError,
  formatError,
  isAbortError,
  TaskConcurrencyError,
} from "./error.ts";
import type { ModelProvider } from "./llm/mod.ts";
import { from, type Observable } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import {
  type FileAttachmentCacheMap,
  FileAttachmentManager,
} from "./storage/mod.ts";
import {
  LoopDecision,
  type LoopInterceptorManager,
} from "./loopInterceptors/mod.ts";
import * as path from "@std/path";

export type TaskEvent =
  | TaskTextEvent
  | TaskMessageEvent
  | TaskToolUseEvent
  | TaskToolUseInputEvent
  | TaskCancelledEvent;

/**
 * Event for streaming incremental content updates
 */
export interface TaskTextEvent {
  type: "text";
  content: string;
}

/**
 * Event for a complete message consisting of multiple accumulated text updates
 */
export interface TaskMessageEvent {
  type: "message";
  message: Message;
}

export interface TaskToolUseEvent {
  type: "tool_use";
  toolName: string;
}

export interface TaskToolUseInputEvent {
  type: "tool_use_input";
  toolName: string;
  partialInput: string;
}

export interface TaskCancelledEvent {
  type: "cancelled";
  reason: "user" | "timeout";
}

const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_MAX_ITERATIONS = 25;

export interface ZypherAgentConfig {
  maxTokens?: number;
  /** Whether to load and save message history. Defaults to true. */
  persistHistory?: boolean;
  /** Whether to enable checkpointing. Defaults to true. */
  enableCheckpointing?: boolean;
  /** Unique identifier for tracking user-specific usage history */
  userId?: string;
  /** Maximum allowed time for a task in milliseconds before it's automatically cancelled. Default is 1 minute (60000ms). Set to 0 to disable. */
  taskTimeoutMs?: number;
  /** Directory to cache file attachments */
  fileAttachmentCacheDir?: string;
  /** Custom instructions to override the default instructions. */
  customInstructions?: string;
  /**
   * Optional workspace directory to "walk" in without changing process cwd.
   * When set, tools and checkpoints operate relative to this directory.
   */
  walkWorkspaceDirectory?: string;
}

export class ZypherAgent {
  readonly #modelProvider: ModelProvider;
  readonly #maxTokens: number;
  readonly #persistHistory: boolean;
  readonly #enableCheckpointing: boolean;
  readonly #userId?: string;
  readonly #mcpServerManager: McpServerManager;
  readonly #taskTimeoutMs: number;
  readonly #storageService?: StorageService;
  readonly #fileAttachmentCacheDir?: string;
  readonly #customInstructions?: string;
  readonly #loopInterceptorManager: LoopInterceptorManager;

  #fileAttachmentManager?: FileAttachmentManager;

  #messages: Message[];
  #system: string;
  #walkWorkspaceDirectory?: string;

  // Task execution state
  #isTaskRunning: boolean = false;
  #taskCompleter: Completer<void> | null = null;

  constructor(
    modelProvider: ModelProvider,
    mcpServerManager: McpServerManager,
    loopInterceptorManager: LoopInterceptorManager,
    config: ZypherAgentConfig = {},
    storageService?: StorageService,
  ) {
    const userId = config.userId ?? Deno.env.get("ZYPHER_USER_ID");

    this.#modelProvider = modelProvider;
    this.#messages = [];
    this.#system = ""; // Will be initialized in init()
    this.#maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.#persistHistory = config.persistHistory ?? true;
    this.#enableCheckpointing = config.enableCheckpointing ?? true;
    this.#userId = userId;
    this.#mcpServerManager = mcpServerManager;
    this.#loopInterceptorManager = loopInterceptorManager;
    this.#storageService = storageService;
    // Default timeout is 15 minutes, 0 = disabled
    this.#taskTimeoutMs = config.taskTimeoutMs ?? 900000;
    this.#customInstructions = config.customInstructions;
    this.#walkWorkspaceDirectory = config.walkWorkspaceDirectory;
  }

  async init(): Promise<void> {
    await this.#loadSystemPrompt();

    if (this.#storageService) {
      this.#fileAttachmentManager = new FileAttachmentManager(
        this.#storageService,
        this.#fileAttachmentCacheDir ??
          path.join(await getZypherDir(), "cache", "files"),
      );
    }

    // Load message history if enabled
    if (this.#persistHistory) {
      this.#messages = await loadMessageHistory(this.#walkWorkspaceDirectory);
    }
  }

  /**
   * Load or reload the system prompt with current custom rules
   * This method reads custom rules from the current working directory
   */
  async #loadSystemPrompt(): Promise<void> {
    const userInfo = getCurrentUserInfo();
    const effectiveUserInfo = this.#walkWorkspaceDirectory
      ? { ...userInfo, workspacePath: this.#walkWorkspaceDirectory }
      : userInfo;
    this.#system = await getSystemPrompt(
      effectiveUserInfo,
      this.#customInstructions,
    );
  }

  /**
   * Get all messages from the agent's history
   * @returns Array of messages
   */
  get messages(): Message[] {
    return [...this.#messages];
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
      await applyCheckpoint(checkpointId, this.#walkWorkspaceDirectory);

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
   * Streaming behavior:
   * - Content is streamed in real-time as it's generated
   * - Tool usage is streamed as tools are invoked
   * - Complete messages are delivered when available
   * - Errors and code fixes are handled automatically
   *
   * @param taskDescription The text description of the task to perform
   * @param streamHandler Handler for real-time content updates and complete messages
   * @param fileAttachments Optional array of file attachments
   * @param options Additional options:
   *   - maxIterations: Maximum number of iterations to run (default: 25)
   *   - signal: AbortSignal for cancellation from the caller
   * @returns Array of messages after task completion, or return as is if cancelled
   * @throws {TaskConcurrencyError} If a task is already running
   */
  runTask(
    taskDescription: string,
    model: string,
    fileAttachments?: FileAttachment[],
    options?: {
      maxIterations?: number;
      signal?: AbortSignal;
    },
  ): Observable<TaskEvent> {
    return from(
      this.#runTaskInternal(taskDescription, model, fileAttachments, options),
    );
  }

  async *#runTaskInternal(
    taskDescription: string,
    model: string,
    fileAttachments?: FileAttachment[],
    options?: {
      maxIterations?: number;
      signal?: AbortSignal;
    },
  ): AsyncGenerator<TaskEvent> {
    // Use default maxIterations if not provided
    const maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    if (!this.#checkAndSetTaskRunning()) {
      throw new TaskConcurrencyError(
        "Cannot run multiple tasks concurrently. A task is already running.",
      );
    }

    this.#taskCompleter = new Completer<void>();
    const timeoutController = new AbortController();

    // Create a composite signal that aborts if either the caller's signal or our timeout signal aborts
    const mergedSignal = options?.signal
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
      // Reload system prompt to get current custom rules from working directory
      await this.#loadSystemPrompt();

      let iterations = 0;

      let checkpointId: string | undefined;
      let checkpoint: Checkpoint | undefined;
      if (this.#enableCheckpointing) {
        const checkpointName = `Before task: ${
          taskDescription.substring(0, 50)
        }${taskDescription.length > 50 ? "..." : ""}`;
        checkpointId = await createCheckpoint(
          checkpointName,
          this.#walkWorkspaceDirectory,
        );
        checkpoint = await getCheckpointDetails(
          checkpointId,
          this.#walkWorkspaceDirectory,
        );
      }

      const messageContent: ContentBlock[] = [
        ...(fileAttachments ?? []),
        {
          type: "text" as const,
          text: taskDescription,
        } satisfies ContentBlock,
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
      yield { type: "message", message: userMessage };

      const toolCalls = Array.from(
        this.#mcpServerManager.getAllTools().values(),
      );

      // Cache file attachments if enabled
      let cacheMap: FileAttachmentCacheMap | undefined;
      if (this.#fileAttachmentManager) {
        cacheMap = await this.#fileAttachmentManager
          .cacheMessageFileAttachments(
            this.#messages,
          );
      }

      while (iterations < maxIterations) {
        // Check for abort signal early
        if (mergedSignal.aborted) {
          throw new AbortError("Task aborted");
        }

        const stream = this.#modelProvider.streamChat(
          {
            model,
            maxTokens: this.#maxTokens,
            system: this.#system,
            messages: this.#messages,
            tools: toolCalls,
            userId: this.#userId,
          },
          cacheMap,
        );

        const modelEvents = stream.events;
        for await (const event of eachValueFrom(modelEvents)) {
          if (event.type === "text") {
            yield { type: "text", content: event.text };
          } else if (event.type === "message") {
            yield { type: "message", message: event.message };
          }
        }

        const finalMessage = await stream.finalMessage();

        // Create the assistant message using the complete content from finalMessage
        const assistantMessage: Message = {
          role: "assistant",
          content: finalMessage.content,
          timestamp: new Date(),
        };
        this.#messages.push(assistantMessage);
        yield { type: "message", message: assistantMessage };

        // Check for cancellation
        if (mergedSignal.aborted) {
          throw new AbortError("Task aborted");
        }

        // Execute loop interceptors to determine if we should continue
        const responseText = finalMessage.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");

        const messageCountBefore = this.#messages.length;

        const interceptorContext = {
          messages: this.#messages,
          lastResponse: responseText,
          tools: toolCalls,
          workingDirectory: this.#walkWorkspaceDirectory ?? Deno.cwd(),
          stopReason: finalMessage.stop_reason,
          signal: mergedSignal,
        };

        const interceptorResult = await this.#loopInterceptorManager.execute(
          interceptorContext,
        );

        if (interceptorResult.decision === LoopDecision.CONTINUE) {
          // Yield any new messages added by interceptors
          for (let i = messageCountBefore; i < this.#messages.length; i++) {
            yield { type: "message", message: this.#messages[i] };
          }
        } else {
          // All interceptors decided to complete, exit the loop
          break;
        }

        iterations++;
      }

      // Save updated message history if enabled
      if (this.#persistHistory) {
        await saveMessageHistory(this.#messages, this.#walkWorkspaceDirectory);
      }

      return this.messages;
    } catch (error) {
      if (isAbortError(error)) {
        console.log(formatError(error));
        console.log("🛑 Task aborted.");

        yield {
          type: "cancelled",
          reason: options?.signal?.aborted ? "user" : "timeout",
        };

        if (this.#persistHistory) {
          await saveMessageHistory(this.#messages, this.#walkWorkspaceDirectory);
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

      this.#taskCompleter.resolve();
    }
  }

  /**
   * Wait for the task to complete
   * @returns A promise that resolves when the task is complete
   * @throws {Error} If no task is running
   */
  async wait(options?: { signal?: AbortSignal }): Promise<void> {
    if (!this.#taskCompleter) {
      throw new Error("Task is not running");
    }
    await this.#taskCompleter.wait(options);
  }
}
