import type { Message } from "../message.ts";
import type { Tool } from "../tools/mod.ts";
import type { FinalMessage } from "../llm/mod.ts";
import type { Subject } from "rxjs";
import type { TaskEvent } from "../task_events.ts";
import type { ZypherContext } from "../zypher_agent.ts";

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
  /** The zypher context containing workspace and environment information */
  zypherContext: ZypherContext;
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
  /** Whether the loop should complete (true) or continue (false) */
  complete: boolean;
  /** Optional reason for continuing - auto-injected as user message when complete is false */
  reason?: string;
}

/**
 * Interface for loop interceptors that run after agent inference
 *
 * Interceptors can inject or modify LLM message context to influence subsequent
 * agent behavior (e.g., add tool results, error messages, continuation prompts).
 */
export interface LoopInterceptor {
  /** Unique name of the interceptor */
  readonly name: string;

  /**
   * Intercept the agent loop to determine whether it should continue or complete.
   *
   * This method is called after the LLM generates a response. You are provided
   * an {@link InterceptorContext} containing the conversation messages, LLM response,
   * available tools, and other context. Use your custom logic to determine
   * if the agent should continue or complete the loop.
   *
   * Interceptors can influence subsequent agent behavior by injecting context
   * into the conversation—such as tool results, error messages, or continuation
   * prompts—guiding the LLM's next response.
   *
   * **Returning a reason**: When returning `{ complete: false, reason: "..." }`,
   * the manager will automatically inject the reason as a user message. For simple
   * cases, this eliminates the need to manually push messages.
   *
   * **Manual message injection**: For complex cases (e.g., tool results with
   * structured content), you can also push directly to `context.messages`.
   * When doing so, omit the `reason` field to avoid duplicate injection.
   *
   * **Event Emission**:
   * - If you modify existing message history, you MUST emit TaskHistoryChangedEvent
   *   via `context.eventSubject.next({ type: "history_changed" })` to notify
   *   that this interceptor changed the history
   * - You MAY also emit custom events to meet your specific needs
   *
   * @param context {@link InterceptorContext} with messages, tools, and event emission capabilities
   * @returns {@link InterceptorResult} indicating whether to continue or complete the loop
   */
  intercept(context: InterceptorContext): Promise<InterceptorResult>;
}
