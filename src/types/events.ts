/**
 * Event types for task execution events
 */
export type TaskEvent = {
  event:
    | "content_delta"
    | "tool_use_delta"
    | "message"
    | "error"
    | "complete"
    | "cancelled"
    | "heartbeat";
  data: unknown; // reason?: "user" | "timeout"; eventId?: string;
};
