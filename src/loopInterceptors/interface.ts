import type { Message } from "../message.ts";
import type { Tool } from "../tools/mod.ts";
import type { FinalMessage } from "../llm/mod.ts";
import type { Subject } from "rxjs";
import type { TaskEvent } from "../TaskEvents.ts";
import type { ZypherContext } from "../ZypherAgent.ts";

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
  /** Decision on whether to continue or complete the loop */
  decision: LoopDecision;
  /** Optional reasoning for the decision (for debugging/logging) */
  reasoning?: string;
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

  /** Description of what this interceptor does */
  readonly description: string;

  /**
   * Execute the interceptor's custom logic to influence agent behavior.
   *
   * This method is called after the LLM generates a response. You are provided
   * an {@link InterceptorContext} containing the conversation messages, LLM response,
   * available tools, and other context. Use your custom logic to determine
   * if the agent should continue or complete the loop.
   *
   * **Modifying Message Context**: To influence subsequent agent behavior,
   * inject or modify messages in `context.messages`:
   * - Add new messages: `context.messages.push(newMessage)` (auto-emits TaskMessageEvent)
   * - Modify existing messages: Use unshift, splice, pop, shift, or direct assignment
   *
   * **Event Emission**:
   * - If you modify existing message history, you MUST emit TaskHistoryChangedEvent
   *   via `context.eventSubject.next({ type: "history_changed" })` to notify
   *   that this interceptor changed the history
   * - You MAY also emit custom events to meet your specific needs
   *
   * @param context {@link InterceptorContext} with messages, tools, and event emission capabilities
   * @returns {@link InterceptorResult} with {@link LoopDecision} on whether to continue or complete the loop
   */
  intercept(context: InterceptorContext): Promise<InterceptorResult>;
}
