import type { FinalMessage } from "./llm/ModelProvider.ts";
import type { Message } from "./message.ts";

export type TaskEvent =
  | TaskTextEvent
  | TaskMessageEvent
  | TaskHistoryChangedEvent
  | TaskToolUseEvent
  | TaskToolUseInputEvent
  | TaskToolUsePendingApprovalEvent
  | TaskToolUseRejectedEvent
  | TaskToolUseApprovedEvent
  | TaskCancelledEvent
  | TaskHandoffFailedEvent;

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
  toolName: string;
}

/**
 * Event emitted when partial tool input is being streamed
 */
export interface TaskToolUseInputEvent {
  type: "tool_use_input";
  toolName: string;
  partialInput: string;
}

/**
 * Event emitted when a tool execution requires user approval
 */
export interface TaskToolUsePendingApprovalEvent {
  type: "tool_use_pending_approval";
  toolName: string;
  parameters: Record<string, unknown>;
}

/**
 * Event emitted when a tool execution is rejected by the user
 */
export interface TaskToolUseRejectedEvent {
  type: "tool_use_rejected";
  toolName: string;
  reason: string;
}

/**
 * Event emitted when a tool execution is approved by the user
 */
export interface TaskToolUseApprovedEvent {
  type: "tool_use_approved";
  toolName: string;
}

/**
 * Event emitted when a task is cancelled by user or timeout
 */
export interface TaskCancelledEvent {
  type: "cancelled";
  reason: "user" | "timeout";
}

/**
 * Event emitted when a handoff to a sub-agent fails
 */
export interface TaskHandoffFailedEvent {
  type: "handoff_failed";
  toolName: string;
  targetAgent: string;
  error: string;
}
