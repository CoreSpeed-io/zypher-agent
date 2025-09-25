import type { Message } from "../message.ts";
import type { Tool } from "../tools/mod.ts";
import type { FinalMessage } from "../llm/mod.ts";
import type { Subject } from "rxjs";
import type { TaskEvent } from "../TaskEvents.ts";

/**
 * Decision made by a loop interceptor
 */
export enum LoopDecision {
  /** Continue the agent loop with injected context */
  CONTINUE = "continue",
  /** Allow the agent loop to complete normally */
  COMPLETE = "complete",
}

/**
 * Context provided to loop interceptors
 */
export interface InterceptorContext {
  /** Current conversation messages including the latest agent response */
  messages: Message[];
  /** The agent's latest response text */
  lastResponse: string;
  /** Available tools */
  tools: Tool[];
  /** Current working directory */
  workingDirectory: string;
  /** Stop reason from the LLM response (e.g., "end_turn", "max_tokens", "tool_use") */
  stopReason?: FinalMessage["stop_reason"];
  /** Abort signal for cancellation */
  signal: AbortSignal;
  /**
   * RxJS Subject for emitting task events during interceptor execution.
   *
   * **Note**: Message events are automatically emitted when interceptors
   * add new messages using push(). Other array operations (unshift, splice, pop, shift)
   * do not auto-emit and require manual emission of TaskHistoryChangedEvent if needed.
   *
   * This subject can be used for custom task events like tool execution
   * progress, approval requests, history modifications, etc.
   */
  eventSubject: Subject<TaskEvent>;
}

/**
 * Result returned by a loop interceptor
 */
export interface InterceptorResult {
  /** Decision on whether to continue or complete the loop */
  decision: LoopDecision;
  /** Optional reasoning for the decision (for debugging/logging) */
  reasoning?: string;
}

/**
 * Interface for loop interceptors that run after agent inference
 *
 * **Automatic Event Emission**: The message array in InterceptorContext automatically
 * emits message events when modified using standard array methods (push, unshift, splice).
 * Interceptors can simply use these methods without manual event emission.
 */
export interface LoopInterceptor {
  /** Unique name of the interceptor */
  readonly name: string;

  /** Description of what this interceptor does */
  readonly description: string;

  /**
   * Execute the interceptor logic
   *
   * Message modifications using `context.messages.push()`, `unshift()`, or `splice()`
   * will automatically emit the appropriate message events.
   *
   * @param context Current interceptor context
   * @returns Promise<InterceptorResult> Decision and optional reasoning
   */
  intercept(context: InterceptorContext): Promise<InterceptorResult>;
}
