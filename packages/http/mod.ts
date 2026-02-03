/**
 * Framework-agnostic HTTP handler for Zypher Agent
 *
 * Uses Hono internally, exports a standard web fetch handler that can be used
 * with Deno.serve, Hono, or any Web-compatible framework.
 *
 * @example Run as standalone server
 * ```bash
 * deno run -A jsr:@zypher/http -k YOUR_API_KEY
 * ```
 *
 * @example Import as library
 * ```ts
 * import { createZypherHandler } from "@zypher/http";
 * import { createZypherAgent } from "@zypher/agent";
 *
 * const agent = await createZypherAgent({
 *   model: "claude-sonnet-4-5-20250929",
 * });
 *
 * const app = createZypherHandler({ agent });
 *
 * // Use with Deno.serve
 * Deno.serve(app.fetch);
 *
 * // Or mount in another Hono app
 * mainApp.route("/api/agent", app);
 * ```
 *
 * ## REST Endpoints
 *
 * - `GET  /health`   - Health check, returns `{ status: "ok" }`
 * - `GET  /messages` - Get agent message history
 * - `DELETE /messages` - Clear agent message history
 *
 * ## WebSocket Endpoint
 *
 * - `GET /task/ws` - WebSocket connection for real-time task execution
 *
 * ### WebSocket Protocol (zypher.v1)
 *
 * Client messages:
 * - `{ action: "startTask", task: string, model?: string }` - Start a new task
 * - `{ action: "resumeTask", lastEventId?: string }` - Resume and replay events
 * - `{ action: "cancelTask" }` - Cancel the running task
 * - `{ action: "approveTool", approved: boolean }` - Approve/reject tool execution
 *
 * Server messages:
 * - HttpTaskEvent objects with `eventId` for tracking
 * - `{ type: "heartbeat", timestamp: number }` - Keep-alive (every 30s)
 * - `{ type: "error", error: string }` - Error occurred
 *
 * @module
 */

// Re-export handler
export {
  createZypherHandler,
  type ErrorContext,
  type ErrorResponse,
  type ZypherHandlerOptions,
} from "./handler.ts";

// Re-export types for library usage
export {
  type CustomErrorEvent,
  type HttpTaskEvent,
  HttpTaskEventId,
  type StandardErrorEvent,
} from "./task_event.ts";
export type {
  McpWebSocketEvent,
  TaskWebSocketClientMessage,
  TaskWebSocketMessage,
  TaskWebSocketServerMessage,
} from "./schema.ts";

if (import.meta.main) {
  const { main } = await import("./main.ts");
  main();
}
