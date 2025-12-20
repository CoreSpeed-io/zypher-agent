import type { FinalMessage, TokenUsage } from "./llm/ModelProvider.ts";
import type { Message } from "./message.ts";
import type { ToolResult } from "./tools/mod.ts";

export type TaskEvent =
  | TaskTextEvent
  | TaskMessageEvent
  | TaskHistoryChangedEvent
  | TaskToolUseEvent
  | TaskToolUseInputEvent
  | TaskToolUsePendingApprovalEvent
  | TaskToolUseRejectedEvent
  | TaskToolUseApprovedEvent
  | TaskToolUseResultEvent
  | TaskToolUseErrorEvent
  | TaskCancelledEvent
  | TaskUsageEvent
  | TaskCompletedEvent;

/**
 * Event for streaming incremental content updates
 */
export interface TaskTextEvent {
  type: "text";
  content: string;
}

/**
 * Event emitted when a complete message is added to the chat history.
 * This includes both new messages from the LLM (assembled from multiple TaskTextEvent updates)
 * and new messages added by interceptors (e.g., tool results, continuation prompts).
 */
export interface TaskMessageEvent {
  type: "message";
  message: Message | FinalMessage;
}

/**
 * Event for when existing chat history (previous messages) is modified.
 * This event is NOT emitted for adding new messages - only for changes to
 * existing message history such as:
 * - Editing/replacing existing messages
 * - Removing messages (pop, shift, splice)
 * - Inserting messages in the middle of history (unshift, splice)
 * - Reordering or batch modifications
 */
export interface TaskHistoryChangedEvent {
  type: "history_changed";
}

/**
 * Event emitted when the LLM indicates intent to call a tool,
 * but before the tool input parameters are generated/streamed
 */
export interface TaskToolUseEvent {
  type: "tool_use";
  toolUseId: string;
  toolName: string;
}

/**
 * Event emitted when partial tool input is being streamed
 */
export interface TaskToolUseInputEvent {
  type: "tool_use_input";
  toolUseId: string;
  toolName: string;
  partialInput: string;
}

/**
 * Event emitted when a tool execution requires user approval
 */
export interface TaskToolUsePendingApprovalEvent {
  type: "tool_use_pending_approval";
  toolUseId: string;
  toolName: string;
  input: unknown;
}

/**
 * Event emitted when a tool execution is rejected by the user
 */
export interface TaskToolUseRejectedEvent {
  type: "tool_use_rejected";
  toolUseId: string;
  toolName: string;
  reason: string;
}

/**
 * Event emitted when a tool execution is approved by the user
 */
export interface TaskToolUseApprovedEvent {
  type: "tool_use_approved";
  toolUseId: string;
  toolName: string;
}

/**
 * Event emitted when a tool execution completes successfully
 */
export interface TaskToolUseResultEvent {
  type: "tool_use_result";
  toolUseId: string;
  toolName: string;
  input: unknown;
  result: ToolResult;
}

/**
 * Event emitted when a tool execution fails with an error
 */
export interface TaskToolUseErrorEvent {
  type: "tool_use_error";
  toolUseId: string;
  toolName: string;
  input: unknown;
  error: unknown;
}

/**
 * Event emitted when a task is cancelled by user or timeout
 */
export interface TaskCancelledEvent {
  type: "cancelled";
  reason: "user" | "timeout";
}

/**
 * Event emitted after each LLM response with token usage information
 */
export interface TaskUsageEvent {
  type: "usage";
  /** Token usage for the current LLM call */
  usage: TokenUsage;
  /** Cumulative token usage across all LLM calls in this task */
  cumulativeUsage: TokenUsage;
}

/**
 * Event emitted when a task completes successfully
 */
export interface TaskCompletedEvent {
  type: "completed";
  /** Total token usage for the entire task (undefined if provider didn't return usage data) */
  totalUsage?: TokenUsage;
}
