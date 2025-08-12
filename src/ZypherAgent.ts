import {
  getCurrentUserInfo,
  getZypherDir,
  loadMessageHistory,
  saveMessageHistory,
} from "./utils/mod.ts";
import { detectErrors } from "./errorDetection/mod.ts";
import { getSystemPrompt } from "./prompt.ts";
import {
  applyCheckpoint,
  type Checkpoint,
  createCheckpoint,
  getCheckpointDetails,
} from "./checkpoints.ts";
import {
  type ContentBlock,
  type FileAttachment,
  type Message,
} from "./message.ts";
import type { McpServerManager } from "./mcp/McpServerManager.ts";
import type { StorageService } from "./storage/StorageService.ts";
import { Completer } from "./utils/mod.ts";
import { AbortError, formatError, isAbortError } from "./error.ts";
import type { ModelProvider } from "./llm/mod.ts";
import { from, Observable } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import {
  type FileAttachmentCacheMap,
  FileAttachmentManager,
} from "./storage/mod.ts";
import * as path from "@std/path";
import { callOpenAIReflection} from "./tools/openai.ts";
import { yellow, red, bgBlue, white } from "https://deno.land/std@0.224.0/fmt/colors.ts";

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

export type ToolApprovalHandler = (
  name: string,
  args: Record<string, unknown>,
  options: { signal?: AbortSignal },
) => Promise<boolean>;

export interface ZypherAgentConfig {
  maxTokens?: number;
  /** Whether to load and save message history. Defaults to true. */
  persistHistory?: boolean;
  /** Whether to automatically check for code errors. Defaults to true. */
  autoErrorCheck?: boolean;
  /** Whether to enable prompt caching. Defaults to true. */
  enablePromptCaching?: boolean;
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
}

export class ZypherAgent {
  readonly #modelProvider: ModelProvider;
  readonly #maxTokens: number;
  readonly #persistHistory: boolean;
  readonly #autoErrorCheck: boolean;
  readonly #enablePromptCaching: boolean;
  readonly #enableCheckpointing: boolean;
  readonly #userId?: string;
  readonly #mcpServerManager: McpServerManager;
  readonly #taskTimeoutMs: number;
  readonly #storageService?: StorageService;
  readonly #fileAttachmentCacheDir?: string;
  readonly #customInstructions?: string;

  #fileAttachmentManager?: FileAttachmentManager;

  #messages: Message[];
  #system: string;

  // Task execution state
  #isTaskRunning: boolean = false;
  #taskCompleter: Completer<void> | null = null;

  constructor(
    modelProvider: ModelProvider,
    config: ZypherAgentConfig = {},
    mcpServerManager: McpServerManager,
    storageService?: StorageService,
  ) {
    const userId = config.userId ?? Deno.env.get("ZYPHER_USER_ID");

    this.#modelProvider = modelProvider;
    this.#messages = [];
    this.#system = ""; // Will be initialized in init()
    this.#maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.#persistHistory = config.persistHistory ?? true;
    this.#autoErrorCheck = config.autoErrorCheck ?? true;
    this.#enablePromptCaching = config.enablePromptCaching ?? true;
    this.#enableCheckpointing = config.enableCheckpointing ?? true;
    this.#userId = userId;
    this.#mcpServerManager = mcpServerManager;
    this.#storageService = storageService;
    // Default timeout is 5 minutes, 0 = disabled
    this.#taskTimeoutMs = config.taskTimeoutMs ?? 300000;
    this.#fileAttachmentCacheDir = config.fileAttachmentCacheDir;
    this.#customInstructions = config.customInstructions;
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
      this.#messages = await loadMessageHistory();
    }
  }

  /**
   * Load or reload the system prompt with current custom rules
   * This method reads custom rules from the current working directory
   */
  async #loadSystemPrompt(): Promise<void> {
    const userInfo = getCurrentUserInfo();
    this.#system = await getSystemPrompt(
      userInfo,
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

  async #executeToolCall(
    name: string,
    parameters: Record<string, unknown>,
    options?: {
      signal?: AbortSignal;
      handleToolApproval?: ToolApprovalHandler;
    },
  ): Promise<string> {
    const tool = this.#mcpServerManager.getTool(name);
    if (!tool) {
      return `Error: Tool '${name}' not found`;
    }

    const approved = options?.handleToolApproval
      ? await options.handleToolApproval(name, parameters, options)
      : true;
    console.log(`Tool call ${name} approved: ${approved}`);
    if (!approved) {
      return "Tool call rejected by user";
    }

    try {
      // TODO: support abort signal in tool execution
      const toolcall_result = await tool.execute(parameters);
      console.log(`Tool call ${name} result: ${toolcall_result}`);

      return toolcall_result
    } catch (error) {
      return `Error executing tool '${name}': ${formatError(error)}`;
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
      handleToolApproval?: ToolApprovalHandler;
      think?: boolean;
      thinkingBudget?: number;
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
      handleToolApproval?: ToolApprovalHandler;
    },
  ): AsyncGenerator<TaskEvent> {
    // Use default maxIterations if not provided
    const maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const thinking = options?.think ?? DEFAULT_THINKING;
    const thinkingBudget = options?.thinkingBudget ?? DEFAULT_THINKING_BUDGET;
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
        checkpointId = await createCheckpoint(checkpointName);
        checkpoint = await getCheckpointDetails(checkpointId);
      }

      const messageContent: ContentBlock[] = [
        ...(fileAttachments ?? []),
        {
          type: "text" as const,
          text: taskDescription,
        } satisfies ContentBlock,
      ];

      // Add user message with checkpoint reference (if checkpointing is enabled)
      const userMessage: Message = {
        role: "user",
        content: messageContent,
        ...(checkpointId && { checkpointId }),
        ...(checkpoint && { checkpoint }),
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
        // should review the final message?
        if (count_reflection_tokens < max_reflection_tokens) {
          // Call OpenAI reflection tool to review the final message
          // reflect on the final message content
          const historyBlocks: ContentBlock[] = this.#messages.flatMap((m) =>
            typeof m.content === "string"
              ? [{ type: "text", text: m.content }]
              : m.content
          );


          const historySummary = extractTextFromBlocks(historyBlocks);


          const usedFiles: string[] = [];

          for (const block of finalMessage.content) {
            if (block.type === "tool_use") {
              const input = block.input as Record<string, unknown>;
              const command = input["command"];
              if (typeof command === "string") {
  
                const match = command.match(/[\w\-\/\.]+\.py/);
                if (match) {
                  const fileName = match[0];
                  const fullPath = await this.#getFileAttachmentCachePath(fileName);
                  usedFiles.push(fullPath);
                }
              }
            }
          }

          const toolFileSummary = usedFiles.length > 0
            ? `\nTool file(s) used in the command:\n${usedFiles.join("\n")}\n\n`
            : "";

          // console.log(red("\n  should update!! " + extractTextFromBlocks(finalMessage.content)));
          console.log(red("\n  should update!! " + finalMessage.content));
          const reflectionPrompt = `Here is a user question:\n
          ${taskDescription}\n\n
          And here is the assistant's answer:\n${extractTextFromBlocks(finalMessage.content)}\n\n
          History of the conversation:\n${historySummary}\n\n
          You can find assistant's file in the tool call result below:\n${toolFileSummary}\n\n
          Your task is to determine whether the answer is logically correct, or if there are potential logical problems that require re-evaluation. If a tool call is made, allow it to proceed. Only check whether the content of the call is reasonable (do not block the call because the analysis is not detailed enough).

          - If a tool call is made (e.g., to read a document or image), DO NOT reflect just because the tool’s result is not displayed or discussed yet. This is expected behavior. You are NOT judging the sufficiency of analysis at this stage.
          - Reflect if:
            1. The tool call is clearly incorrect, unjustified, or irrelevant to the user’s question.
            2. The response shows obvious logical flaws, misunderstandings, or hallucinations.
            3. Answer is incomplete or does not address the user’s question.
            4. including 'My Analysis' any some logical reasoning that is not supported by evidence.
          - This is a basic agent, so when it says it's writing code, reading or searching documents and images (and similar), it's referring to the tool it's about to call to perform that task. Therefore, it won't directly display the results it's received. Instead, it needs to determine whether the tool call was correct.
          - very carefully on understand and logically, Is the reasoning used reasonable and supported by evidence?
          You are talking to this assistant, please do not use the word assistant to refer to it
          - donot reflect:
            1. There is no inference or explanation, only the next step.
            2. just using the tool[Tool Call] and donot include reasoning
            3. error in history, and now is right step.
          - If the task is to **find something**, check:
            1. Whether it looked in the **correct place**.
            2. Whether the **search logic** is reasonable.
            3. Whether the **order of search** (e.g., first/last item, reverse/chronological order) is handled correctly.

          Respond in **strict JSON format** like:
          {
            "should_reflect": true or false,
            "suggestion": "A concise suggestion for improvement, or 'Looks good.' if acceptable."
          }

          Is the response logically sound, complete, and on-task?`;

          const reflection = await callOpenAIReflection(reflectionPrompt);
 
          console.log("\n 🔍 Assistant's file(s) used in the command:", toolFileSummary);
          let reflectionObj: { should_reflect: boolean; suggestion: string };
          try {
            const raw = typeof reflection === "string" ? extractPureJSON(reflection) : reflection;
            reflectionObj = typeof raw === "string"
              ? JSON.parse(raw)
              : raw as { should_reflect: boolean; suggestion: string };
          } catch {
            console.error("❌ Failed to parse reflection:", reflection);
            reflectionObj = { should_reflect: false, suggestion: "Parse error" };
          }

          console.log(bgBlue(
            `\n Reflection Result: ${reflectionObj.should_reflect} — ${reflectionObj.suggestion}`
          ));


          // if should reflect , continue the loop
          if (reflectionObj.should_reflect) {
            count_reflection_tokens++;
            const reflectionMessage: Message = {
              role: "user",
              content: `Your thinking is not clear and there are obvious mistakes. 
              Your reading is missing other content. Can you stop focusing on the information you have obtained and look again at what information is provided to you?
              You need to be aware of the following::\n\n${reflectionObj.suggestion}\n\n`,
              timestamp: new Date(),
            };
            this.#messages.push(reflectionMessage);
            streamHandler?.onMessage?.(reflectionMessage);            
            continue;
          } else{
            count_reflection_tokens = 0; // reset reflection token count
          }
        } else {
          console.log(yellow("\nSkipping reflection due to max reflection tokens reached"));
          count_reflection_tokens = 0;
        }

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

        // Process tool calls if any
        if (finalMessage.stop_reason === "tool_use") {
          // Execute tool calls
          for (const block of finalMessage.content) {
            if (block.type === "tool_use") {
              const result = await this.#executeToolCall(
                block.name,
                block.input as Record<string, unknown>,
                {
                  signal: mergedSignal,
                  handleToolApproval: options?.handleToolApproval,
                },
              );

              // Add tool response
              const toolMessage: Message = {
                role: "user",
                content: [
                  {
                    type: "tool_result" as const,
                    tool_use_id: block.id,
                    content: result,
                  } satisfies ContentBlock,
                ],
                timestamp: new Date(),
              };
              this.#messages.push(toolMessage);
              yield { type: "message", message: toolMessage };
            }
          }
        } else if (finalMessage.stop_reason === "max_tokens") {
          // auto continue
          const continueMessage: Message = {
            role: "user",
            content: [
              {
                type: "text" as const,
                text: "Continue",
              } satisfies ContentBlock,
            ],
            timestamp: new Date(),
          };
          this.#messages.push(continueMessage);
          yield { type: "message", message: continueMessage };
        } else {
          // Check for code errors if enabled and this is the end of the conversation
          if (this.#autoErrorCheck) {
            const errors = await detectErrors({ signal: mergedSignal });
            if (errors) {
              console.log(
                "\n🔍 Detected code errors. Asking the agent to fix them...",
              );

              // Add errors as a user message
              const errorMessage: Message = {
                role: "user",
                content: [
                  {
                    type: "text" as const,
                    text:
                      `I noticed some errors in the code. Please fix these issues:\n\n${errors}\n\nPlease explain what was wrong and how you fixed it.`,
                  } satisfies ContentBlock,
                ],
                timestamp: new Date(),
              };
              this.#messages.push(errorMessage);
              yield { type: "message", message: errorMessage };

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

        yield {
          type: "cancelled",
          reason: options?.signal?.aborted ? "user" : "timeout",
        };

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

function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      if (typeof block === "string") return block;

      if (block.type === "tool_result") {
        const c = block.content;
        if (typeof c === "string") return c;
        if (Array.isArray(c)) {
          return (c as Array<string | { text?: string }>).map((x) =>
            typeof x === "string" ? x : x?.text ?? ""
          ).join("\n");
        }

        return "[TOOL RESULT]";
      }

      if (block.type === "text") return block.text;
      if (block.type === "tool_use") return `[Tool Call: ${block.name}]`;
      if (block.type === "image") return `[IMAGE BLOCK]`;
      if (block.type === "document") return `[DOCUMENT BLOCK]`;
      if (isFileAttachment(block)) return `[FILE: ${block.fileId}]`;

      return "";
    })
    .join("\n");
}


function extractPureJSON(text: string): string {
  // Remove ```json ... ``` or ``` ... ``` blocks
  return text.trim()
    .replace(/^```(?:json)?\n?/i, '')  // Remove opening ``` or ```json
    .replace(/\n?```$/, '')            // Remove closing ```
}
