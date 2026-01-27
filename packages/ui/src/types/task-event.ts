import type { Message } from "./message";

export type TaskEvent =
  | TaskTextEvent
  | TaskMessageEvent
  | TaskHistoryChangedEvent
  | TaskToolUseEvent
  | TaskToolUseInputEvent
  | TaskToolUsePendingApprovalEvent
  | TaskToolUseApprovedEvent
  | TaskToolUseRejectedEvent
  | TaskToolUseResultEvent
  | TaskToolUseErrorEvent
  | TaskCancelledEvent
  | TaskUsageEvent
  | TaskCompletedEvent
  | TaskHeartbeatEvent
  | TaskErrorEvent;

export interface TaskTextEvent {
  type: "text";
  content: string;
  eventId: string;
}

export interface TaskMessageEvent {
  type: "message";
  message: Message;
  eventId: string;
}

export interface TaskHistoryChangedEvent {
  type: "history_changed";
  eventId: string;
}

export interface TaskToolUseEvent {
  type: "tool_use";
  toolUseId: string;
  toolName: string;
  eventId: string;
}

export interface TaskToolUseInputEvent {
  type: "tool_use_input";
  toolUseId: string;
  toolName: string;
  partialInput: string;
  eventId: string;
}

export interface TaskToolUsePendingApprovalEvent {
  type: "tool_use_pending_approval";
  toolUseId: string;
  toolName: string;
  input: unknown;
  eventId: string;
}

export interface TaskToolUseApprovedEvent {
  type: "tool_use_approved";
  toolUseId: string;
  toolName: string;
  eventId: string;
}

export interface TaskToolUseRejectedEvent {
  type: "tool_use_rejected";
  toolUseId: string;
  toolName: string;
  reason?: string;
  eventId: string;
}

export interface TaskToolUseResultEvent {
  type: "tool_use_result";
  toolUseId: string;
  toolName: string;
  input: unknown;
  result: unknown;
  eventId: string;
}

export interface TaskToolUseErrorEvent {
  type: "tool_use_error";
  toolUseId: string;
  toolName: string;
  input: unknown;
  error: string;
  eventId: string;
}

export interface TaskCancelledEvent {
  type: "cancelled";
  reason: "user" | "timeout";
  eventId: string;
}

export interface TaskUsageEvent {
  type: "usage";
  usage: TokenUsage;
  cumulativeUsage: TokenUsage;
  eventId: string;
}

export interface TaskCompletedEvent {
  type: "completed";
  timestamp: number;
  totalUsage?: TokenUsage;
  eventId?: string;
}

export interface TaskHeartbeatEvent {
  type: "heartbeat";
  timestamp: number;
  eventId: string;
}

export interface TaskErrorEvent {
  type: "error";
  error: string;
  eventId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}
