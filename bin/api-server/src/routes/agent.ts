import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { upgradeWebSocket } from "hono/deno";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { listCheckpoints } from "../../../../src/checkpoints.ts";
import {
  type ImageAttachment as ZypherImageAttachment,
  type StreamHandler,
  ZypherAgent,
} from "../../../../src/ZypherAgent.ts";
import { formatError } from "../../../../src/utils/index.ts";
import { ApiError } from "../error.ts";
import type { TaskEvent } from "../types/events.ts";
import { TaskStreamManager } from "../utils/StreamRecovery.ts";

const agentRouter = new Hono();
// Create an instance of TaskStreamManager
const taskStreamManager = new TaskStreamManager();

// Zod Schemas
// Define supported image MIME types with more precise validation
const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

// Zod schema for base64 image validation
const base64ImageSchema = z
  .string()
  .regex(/^data:image\/[a-zA-Z+]+;base64,/, "Invalid base64 image format")
  .refine(
    (data) => {
      const [header] = data.split(",");
      const mimeType = header?.split(":")[1]?.split(";")[0];
      return (
        mimeType &&
        SUPPORTED_IMAGE_TYPES.includes(mimeType as SupportedImageType)
      );
    },
    {
      message: `Image must be one of the following types: ${
        SUPPORTED_IMAGE_TYPES.join(", ")
      }`,
    },
  );

// Zod schema for image validation
const imageSchema = z.object({
  name: z.string(),
  data: base64ImageSchema,
});
type ImageAttachment = z.infer<typeof imageSchema>;

// Zod schema for task
const taskSchema = z.object({
  task: z.string(),
  imageAttachments: z.array(imageSchema).optional(),
});

const checkpointParamsSchema = z.object({
  checkpointId: z.string().min(1, "Checkpoint ID cannot be empty"),
});

// Add Zod schema for stream reconnection
const streamReconnectSchema = z.object({
  lastEventId: z.string().optional(),
});

export function createAgentRouter(agent: ZypherAgent): Hono {
  // Get agent messages
  agentRouter.get("/messages", (c) => {
    const messages = agent.getMessages();
    return c.json(messages);
  });

  // Clear agent messages
  agentRouter.delete("/messages", (c) => {
    agent.clearMessages();
    return c.body(null, 204);
  });

  // Cancel the current task
  agentRouter.get("/task/cancel", (c) => {
    // Check if a task is running
    if (!agent.isTaskRunning) {
      throw new ApiError(
        404,
        "task_not_running",
        "No task was running to cancel",
      );
    }

    // Task is running, cancel it
    agent.cancelTask("user");
    console.log("Task cancellation requested by user via API");

    return c.json({
      success: true,
      message: "Task cancelled successfully",
      status: "idle",
    });
  });

  async function runAgentTask(
    task: string,
    imageAttachments: ZypherImageAttachment[],
    onEvent: (event: TaskEvent) => void,
  ): Promise<void> {
    // Generate a unique task ID
    const taskId = `task_${Date.now()}`;

    // Start tracking this task in the stream manager
    taskStreamManager.startTask(taskId);

    // Set up streaming handler for the agent
    const streamHandler: StreamHandler = {
      onContent: (content, _isFirstChunk) => {
        // Create basic event and send to StreamRecovery to add eventId
        const event = taskStreamManager.addEvent({
          event: "content_delta",
          data: { content },
        });
        // Use the event with eventId
        if (event) onEvent(event);
      },
      onToolUse: (name, partialInput) => {
        // Create basic event and send to StreamRecovery to add eventId
        const event = taskStreamManager.addEvent({
          event: "tool_use_delta",
          data: { name, partialInput },
        });
        // Use the event with eventId
        if (event) onEvent(event);
      },
      onMessage: (message) => {
        // Create basic event and send to StreamRecovery to add eventId
        const event = taskStreamManager.addEvent({
          event: "message",
          data: message,
        });
        // Use the event with eventId
        if (event) onEvent(event);
      },
      onCancelled: (reason) => {
        // Create a user-friendly message based on the reason
        let message: string;
        switch (reason) {
          case "user":
            message = "Task was cancelled by user";
            break;
          case "timeout":
            message = `Task was cancelled due to timeout (${
              agent.taskTimeoutMs / 1000
            }s limit)`;
            break;
          default:
            message = "Task was cancelled";
        }

        // Create basic event and send to StreamRecovery to add eventId
        const event = taskStreamManager.addEvent({
          event: "cancelled",
          data: { message, reason },
        });

        // Use the event with eventId
        if (event) onEvent(event);

        console.log(`Task cancelled: ${message} (reason: ${reason})`);
      },
    };

    try {
      const messages = await agent.runTaskWithStreaming(
        task,
        streamHandler,
        imageAttachments,
      );

      // Empty messages array means task was cancelled
      if (messages.length === 0 && agent.cancellationReason) {
        // Cancellation was already handled by onCancelled
        return;
      }

      // Otherwise, task completed successfully
      const event = taskStreamManager.addEvent({
        event: "complete",
        data: {},
      });
      // Use the event with eventId
      if (event) onEvent(event);
    } catch (error) {
      // For any other errors, provide detailed error info for debugging
      console.error("Error running agent task:", formatError(error));

      const event = taskStreamManager.addEvent({
        event: "error",
        data: {
          error: formatError(error),
        },
      });

      // Use the event with eventId
      if (event) onEvent(event);
    }
  }

  function processImages(images: ImageAttachment[]): ZypherImageAttachment[] {
    return images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.data.split(":")[1].split(";")[0] as SupportedImageType,
        data: img.data.split(",")[1],
      },
    }));
  }

  // Run a task
  agentRouter.post("/task/sse", zValidator("json", taskSchema), (c) => {
    const { task, imageAttachments } = c.req.valid("json");
    const processedImages: ZypherImageAttachment[] = imageAttachments
      ? processImages(imageAttachments)
      : [];
    // If the task is already running, return a 409 error
    /**
     * Sample response: {
        "code": 409,
        "type": "task_in_progress",
        "message": "A task is already running"
      }
     */

    if (!agent.checkAndSetTaskRunning()) {
      return c.json({
        code: 409,
        type: "task_in_progress",
        message: "A task is already running",
      }, 409);
    }

    return streamSSE(
      c,
      async (stream) => {
        // Below contains a workaround to ensure the complete event is sent.
        // This is needed because the connection might close before the complete event is sent.
        // TODO: Find a better solution.
        let taskCompleted = false;

        // Handle SSE connection closure
        c.req.raw.signal.addEventListener("abort", () => {
          console.log("SSE connection aborted");
          if (agent.isTaskRunning) {
            console.log("Cancelling task due to SSE connection closure");
            agent.cancelTask("user");
          }
        });

        // Pass event handlers during initialization
        await runAgentTask(task, processedImages, (event) => {
          if (event.event === "complete" || event.event === "cancelled") {
            taskCompleted = true;
          }

          void stream.writeSSE({
            event: event.event,
            data: JSON.stringify(
              typeof event.data === "object" && event.data
                ? { ...event.data }
                : { value: event.data },
            ),
          });
        });

        // If the complete event wasn't sent through the normal flow, send it now
        if (!taskCompleted) {
          // Create a complete event with ID through StreamRecovery
          const event = taskStreamManager.addEvent({
            event: "complete",
            data: {},
          });

          void stream.writeSSE({
            event: "complete",
            data: JSON.stringify(event && event.data ? event.data : {}),
          });
        }

        // Add a small delay to ensure the event is sent before the stream closes
        await new Promise((resolve) => setTimeout(resolve, 100));
      },
    );
  });

  // Add a new GET endpoint for stream reconnection
  agentRouter.get(
    "/task/sse",
    zValidator("query", streamReconnectSchema),
    (c) => {
      // First try to get lastEventId from standard Last-Event-ID header, then fallback to query param
      const headerLastEventId = c.req.header("Last-Event-ID");
      const queryLastEventId = c.req.valid("query").lastEventId;
      const lastEventId = headerLastEventId || queryLastEventId;

      // If no event stream is available, return 204 No Content
      if (!taskStreamManager.hasEventStream()) {
        return c.body(null, 204);
      }

      return streamSSE(
        c,
        async (stream) => {
          let isAborted = false;

          // Handle SSE connection closure
          c.req.raw.signal.addEventListener("abort", () => {
            console.log("SSE reconnection aborted");
            isAborted = true;
          });

          // Create a subscription that will continue until the task completes
          const subscription = taskStreamManager.getEventStream(lastEventId)
            .subscribe({
              next: (event) => {
                if (!isAborted) {
                  void stream.writeSSE({
                    event: event.event,
                    data: JSON.stringify(
                      typeof event.data === "object" && event.data
                        ? event.data
                        : { value: event.data },
                    ),
                  });
                }
              },
              error: (err) => {
                console.error("Error in SSE stream:", err);
                if (!isAborted) {
                  // Log error event through StreamRecovery to get an eventId
                  const errorEvent = taskStreamManager.addEvent({
                    event: "error",
                    data: { error: formatError(err) },
                  });

                  if (errorEvent && errorEvent.data) {
                    void stream.writeSSE({
                      event: "error",
                      data: JSON.stringify(errorEvent.data),
                    });
                  }
                }
              },
              complete: () => {
                console.log("Task stream completed");
              },
            });

          // Keep the stream open until the task completes
          await new Promise<void>((resolve) => {
            // Timer to check if the task stream has ended
            const checkInterval = setInterval(() => {
              if (!taskStreamManager.hasEventStream()) {
                clearInterval(checkInterval);
                subscription.unsubscribe();
                resolve();
              }
            }, 1000);

            // Clean up resources when connection closes
            c.req.raw.signal.addEventListener("abort", () => {
              clearInterval(checkInterval);
              subscription.unsubscribe();
              resolve();
            });
          });
        },
      );
    },
  );

  // Run a task (websocket)
  agentRouter.get(
    "/task/ws",
    upgradeWebSocket((_c) => {
      return {
        onMessage(event, ws) {
          const messageData = JSON.parse(event.data as string);
          const result = taskSchema.safeParse(messageData);
          if (!result.success) {
            ws.send(JSON.stringify({
              event: "error",
              data: {
                error: "Invalid request format",
                details: result.error.format(),
              },
            }));
            return;
          }

          // If the task is already running, return a 409 error
          if (!agent.checkAndSetTaskRunning()) {
            ws.send(JSON.stringify({
              event: "error",
              data: {
                code: 409,
                type: "task_in_progress",
                message: "A task is already running",
              },
            }));
            return;
          }

          const { task, imageAttachments } = result.data;
          const processedImages: ZypherImageAttachment[] = imageAttachments
            ? processImages(imageAttachments)
            : [];

          runAgentTask(task, processedImages, (event) => {
            // Only send if the WebSocket is still open
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(event));
            }
          });
        },
        onClose() {
          console.log("WebSocket connection closed");
          // Cancel running task if WebSocket connection is closed
          if (agent.isTaskRunning) {
            console.log("Cancelling task due to WebSocket closure");
            agent.cancelTask("user");
          }
        },
        onError(error) {
          console.error("WebSocket error:", error);
          // Also cancel task on WebSocket error
          if (agent.isTaskRunning) {
            console.log("Cancelling task due to WebSocket error");
            agent.cancelTask("user");
          }
        },
      };
    }),
  );

  // List checkpoints
  agentRouter.get("/checkpoints", async (c) => {
    const checkpoints = await listCheckpoints();
    return c.json(checkpoints);
  });

  // Apply checkpoint
  agentRouter.post(
    "/checkpoints/:checkpointId/apply",
    zValidator("param", checkpointParamsSchema),
    async (c) => {
      const checkpointId = c.req.param("checkpointId");

      // Use the agent's applyCheckpoint method to update both filesystem and message history
      await agent.applyCheckpoint(checkpointId);
      return c.json({ success: true, id: checkpointId });
    },
  );

  return agentRouter;
}
