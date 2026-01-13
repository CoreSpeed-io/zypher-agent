import z from "zod";
import { type HttpTaskEvent, HttpTaskEventId } from "./task_event.ts";

// Zod Schemas
export const fileIdSchema = z.string().min(1, "File ID cannot be empty");

// Schema for validating and transforming task event IDs - parses once into HttpTaskEventId
export const taskEventIdSchema = z.string().transform((id, ctx) => {
  const parsed = HttpTaskEventId.safeParse(id);
  if (parsed === null) {
    ctx.addIssue({
      code: "invalid_format",
      format: "task_<timestamp>_<sequence>",
    });
    return z.NEVER;
  }
  return parsed;
});

// WebSocket message schemas
export const wsClientMessageSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("startTask"),
    task: z.string(),
    model: z.string().optional(),
    fileAttachments: z.array(fileIdSchema).optional(),
  }),
  z.object({
    action: z.literal("resumeTask"),
    lastEventId: taskEventIdSchema.optional(),
  }),
  z.object({
    action: z.literal("cancelTask"),
  }),
  z.object({
    action: z.literal("approveTool"),
    approved: z.boolean(),
  }),
]);

// WebSocket server message schemas
export const wsServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("error"),
    error: z.enum([
      "no_message_received",
      "invalid_message",
      "task_already_in_progress",
      "task_not_running",
      "internal_error",
      "no_tool_approval_pending",
    ]),
  }),
  z.object({
    type: z.literal("completed"),
    timestamp: z.number(),
  }),
]);

export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;

// Helper to send typed server messages
// Uses a duck-typed interface to accept both WebSocket and WSContext
export function sendServerMessage(
  ws: { send: (data: string | ArrayBuffer) => void },
  message: HttpTaskEvent | WsServerMessage,
): void {
  ws.send(JSON.stringify(message));
}
