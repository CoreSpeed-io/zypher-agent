import z from "zod";
import type { HttpTaskEvent } from "./task_event.ts";
import type {
  McpClientStatus,
  McpServerEndpoint,
  McpServerManagerEvent,
  McpServerSource,
} from "@zypher/agent";

// =============================================================================
// Common schemas
// =============================================================================

/** File attachment ID */
export type FileId = string;
export const FileId: z.ZodSchema<FileId> = z
  .string()
  .min(1, "File ID cannot be empty");

/** Task event ID in string format "task_<timestamp>_<sequence>" */
export const TaskEventId = z
  .string()
  .regex(/^task_\d+_\d+$/, "Expected format: task_<timestamp>_<sequence>");

// =============================================================================
// Task WebSocket schemas (/task/ws)
// =============================================================================

/**
 * Messages sent from the client to the server over the task WebSocket.
 * Uses a discriminated union on the "action" field.
 */
export type TaskWebSocketClientMessage =
  | { action: "startTask"; task: string; fileAttachments?: string[] }
  | { action: "resumeTask"; lastEventId?: string }
  | { action: "cancelTask" }
  | { action: "approveTool"; approved: boolean };
export const TaskWebSocketClientMessage: z.ZodSchema<
  TaskWebSocketClientMessage
> = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("startTask"),
    task: z.string(),
    fileAttachments: z.array(FileId).optional(),
  }),
  z.object({
    action: z.literal("resumeTask"),
    lastEventId: TaskEventId.optional(),
  }),
  z.object({
    action: z.literal("cancelTask"),
  }),
  z.object({
    action: z.literal("approveTool"),
    approved: z.boolean(),
  }),
]);

/**
 * Messages sent from the server to the client over the task WebSocket.
 * Errors are communicated via WebSocket close codes, not as messages.
 */
export type TaskWebSocketServerMessage = HttpTaskEvent;

/**
 * All messages that can be sent over the task WebSocket (both directions).
 */
export type TaskWebSocketMessage =
  | TaskWebSocketClientMessage
  | TaskWebSocketServerMessage;

/**
 * Sends a typed message over the task WebSocket connection.
 * Uses a duck-typed interface to accept both WebSocket and WSContext.
 */
export function sendTaskWebSocketMessage(
  ws: { send: (data: string | ArrayBuffer) => void },
  message: TaskWebSocketServerMessage,
): void {
  ws.send(JSON.stringify(message));
}

// =============================================================================
// MCP WebSocket schemas (/mcp/ws)
// =============================================================================

/**
 * Events sent over the MCP WebSocket connection (/mcp/ws).
 * These are frontend-friendly versions of internal McpServerManagerEvent.
 */
export type McpWebSocketEvent =
  | {
    /** Sent immediately on connection with the current state of all servers */
    type: "initial_state";
    servers: Array<{
      serverId: string;
      server: McpServerEndpoint;
      source: McpServerSource;
      status: McpClientStatus;
      enabled: boolean;
      /** Present when OAuth authentication is required */
      pendingOAuthUrl?: string;
    }>;
  }
  | {
    /** Emitted when a new MCP server is registered */
    type: "server_added";
    serverId: string;
    server: McpServerEndpoint;
    source: McpServerSource;
  }
  | {
    /** Emitted when server configuration or enabled state changes */
    type: "server_updated";
    serverId: string;
    updates: { server?: McpServerEndpoint; enabled?: boolean };
  }
  | {
    /** Emitted when a server is deregistered */
    type: "server_removed";
    serverId: string;
  }
  | {
    /** Emitted when client connection status changes (connecting, connected, error, etc.) */
    type: "client_status_changed";
    serverId: string;
    status: McpClientStatus;
    /** Present when status is "awaitingOAuth" - URL for user to complete OAuth flow */
    pendingOAuthUrl?: string;
  }
  | {
    /** Emitted on subscription errors */
    type: "error";
    error: string;
  };

/**
 * Transforms internal McpServerManagerEvent to frontend-friendly McpWebSocketEvent.
 *
 * Filters out events not relevant to the frontend and strips internal details
 * (e.g., removes the full McpClient object, keeping only pendingOAuthUrl).
 *
 * @returns The transformed event, or undefined if the event should be filtered out
 */
export function toMcpWebSocketEvent(
  event: McpServerManagerEvent,
): McpWebSocketEvent | undefined {
  if (event.type === "client_status_changed") {
    // Extract only the pendingOAuthUrl from the client object
    // to avoid exposing internal McpClient details to the frontend
    const { client, ...rest } = event;
    return {
      ...rest,
      pendingOAuthUrl: client.pendingOAuthUrl,
    };
  } else if (
    event.type === "server_added" ||
    event.type === "server_updated" ||
    event.type === "server_removed"
  ) {
    // These events can be passed through as-is
    return event;
  } else {
    // Filter out any other internal events not meant for the frontend
    return undefined;
  }
}
