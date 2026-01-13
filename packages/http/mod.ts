/**
 * @zypher/http - Framework-agnostic HTTP handler for Zypher Agent
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
 * import { createZypherAgent, AnthropicModelProvider } from "@zypher/agent";
 *
 * const agent = await createZypherAgent({
 *   modelProvider: new AnthropicModelProvider({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! }),
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
 * - `{ type: "completed", timestamp: number }` - Task completed
 * - `{ type: "error", error: string }` - Error occurred
 *
 * @module
 */

import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import { sendServerMessage, wsClientMessageSchema } from "./schema.ts";
import {
  type HttpTaskEvent,
  HttpTaskEventId,
  replayHttpTaskEvents,
  withHttpTaskEventReplayAndHeartbeat,
} from "./task_event.ts";
import { filter, map, type Observable, type ReplaySubject } from "rxjs";
import type { Completer, ZypherAgent } from "@zypher/agent";

export interface ZypherHandlerOptions {
  agent: ZypherAgent;
}

/**
 * Creates a Hono app that handles Zypher agent requests.
 * The returned app can be used as a fetch handler or mounted in another Hono app.
 */
export function createZypherHandler(options: ZypherHandlerOptions): Hono {
  const app = new Hono();
  const { agent } = options;

  let taskAbortController: AbortController | null = null;
  let taskEventSubject: ReplaySubject<HttpTaskEvent> | null = null;
  let toolApprovalCompletor: Completer<boolean> | null = null;
  let serverLatestEventId: HttpTaskEventId | undefined;

  // Health check
  app.get("/health", (c) => c.json({ status: "ok" }));

  // Get agent messages
  app.get("/messages", (c) => {
    return c.json(agent.messages);
  });

  // Clear agent messages
  app.delete("/messages", (c) => {
    agent.clearMessages();
    return c.body(null, 204);
  });

  // Agent websocket
  app.get(
    "/task/ws",
    upgradeWebSocket(
      () => {
        let firstMessageTimeoutId: number;
        let firstMessageReceived = false;

        return {
          onOpen: (_, ws) => {
            // Set timeout to close connection if no message is received within 6 seconds
            firstMessageTimeoutId = setTimeout(() => {
              if (!firstMessageReceived) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.close(1008, "no_message_received");
                }
              }
            }, 6000); // 6 seconds timeout
          },
          onMessage(event, ws) {
            if (!firstMessageReceived) {
              firstMessageReceived = true;
              clearTimeout(firstMessageTimeoutId); // Clear timeout as the first message has been received
            }

            let rawMessage: unknown;
            try {
              rawMessage = JSON.parse(event.data.toString());
            } catch (error) {
              if (error instanceof SyntaxError) {
                ws.close(1003, "invalid_message");
                return;
              }
              throw error;
            }

            const { success, data: message } = wsClientMessageSchema.safeParse(
              rawMessage,
            );

            if (!success) {
              ws.close(1003, "invalid_message");
              return;
            }

            switch (message.action) {
              case "startTask": {
                const resolvedModel = message.model ??
                  "claude-sonnet-4-5-20250929";

                // Check if a task is already running
                if (taskAbortController || taskEventSubject) {
                  ws.close(1008, "task_already_in_progress");
                  return;
                }

                // Create abort controller and start task
                const abortController = taskAbortController ??=
                  new AbortController();

                const eventSubject = taskEventSubject ??= runAgentTask(
                  agent,
                  message.task,
                  resolvedModel,
                  { signal: abortController.signal },
                );

                // Subscribe to events and send them over WebSocket
                eventSubject.subscribe({
                  next: (taskEvent) => {
                    serverLatestEventId = taskEvent.eventId;
                    sendServerMessage(ws, taskEvent);
                  },
                  error: () => {
                    ws.close(1011, "internal_error");

                    // Clean up
                    taskEventSubject = null;
                    taskAbortController = null;
                  },
                  complete: () => {
                    ws.close(1000, "task_complete");

                    // Clean up
                    taskEventSubject = null;
                    taskAbortController = null;
                  },
                });
                break;
              }

              case "resumeTask": {
                // Check if a task is running
                if (!taskEventSubject || !taskAbortController) {
                  ws.close(1008, "task_not_running");
                  return;
                }

                // Replay events from the task event subject
                const events$ = replayHttpTaskEvents(
                  taskEventSubject,
                  serverLatestEventId,
                  message.lastEventId,
                );

                // Subscribe to replayed events and send them over WebSocket
                events$.subscribe({
                  next: (taskEvent) => {
                    sendServerMessage(ws, taskEvent);
                  },
                  error: () => {
                    ws.close(1011, "internal_error");
                  },
                  complete: () => {
                    sendServerMessage(ws, {
                      type: "completed",
                      timestamp: Date.now(),
                    });
                    ws.close(1000, "task_complete");
                    // Note: Don't clean up taskEventSubject here since the original
                    // subscription is still active. Only the startTask handler should clean up.
                  },
                });
                break;
              }

              case "cancelTask": {
                // Check if a task is running
                if (!agent.isTaskRunning) {
                  ws.close(1008, "task_not_running");
                  return;
                }

                if (!taskAbortController || !taskEventSubject) {
                  ws.close(1011, "internal_error");
                  return;
                }

                if (!taskAbortController.signal.aborted) {
                  taskAbortController.abort();
                }

                break;
              }

              case "approveTool": {
                if (!toolApprovalCompletor) {
                  ws.close(1008, "no_tool_approval_pending");
                  return;
                }

                toolApprovalCompletor.resolve(message.approved);
                toolApprovalCompletor = null;
                break;
              }
            }
          },
          onClose: () => {
            // Clean up timeout if the connection was closed before the first message was received
            clearTimeout(firstMessageTimeoutId);
          },
        };
      },
      {
        protocol: "zypher.v1",
      },
    ),
  );

  return app;
}

function runAgentTask(
  agent: ZypherAgent,
  taskPrompt: string,
  model: string,
  options?: { signal?: AbortSignal },
): ReplaySubject<HttpTaskEvent> {
  const zypherHttpTaskEvent$ = agent.runTask(
    taskPrompt,
    model,
    [],
    options,
  );

  // Track whether we've seen the first message event
  let firstUserMessageEventSeen = false;

  const agentHttpTaskEvent$: Observable<HttpTaskEvent> = zypherHttpTaskEvent$
    .pipe(
      filter((event) => {
        // Filter out the first user message event since the client optimistically updates
        if (!firstUserMessageEventSeen && event.type === "message") {
          if (event.message.role === "user") {
            firstUserMessageEventSeen = true;
            return false; // Skip this event
          }
        }
        return true;
      }),
      map((event): HttpTaskEvent => {
        // Add eventId to the Zypher event
        const eventId = HttpTaskEventId.generate();
        return {
          ...event,
          eventId,
        };
      }),
    );

  // 30 seconds heartbeat
  return withHttpTaskEventReplayAndHeartbeat(agentHttpTaskEvent$, 30000);
}

// Re-export for library usage
export { type HttpTaskEvent, HttpTaskEventId } from "./task_event.ts";

if (import.meta.main) {
  const { main } = await import("./main.ts");
  main();
}
