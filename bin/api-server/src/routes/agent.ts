import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { listCheckpoints } from "../../../../src/checkpoints.ts";
import {
  type ImageAttachment as ZypherImageAttachment,
  type StreamHandler,
  ZypherAgent,
} from "../../../../src/ZypherAgent.ts";
import { formatError } from "../../../../src/utils/mod.ts";
import { ApiError } from "../error.ts";
import {
  type TaskEvent,
  TaskEventId,
  withReplayAndHeartbeat,
} from "../taskEvents.ts";
import { Observable, ReplaySubject } from "rxjs";
import { filter } from "rxjs/operators";
import { eachValueFrom } from "rxjs-for-await";
import { Completor } from "../completor.ts";

const agentRouter = new Hono();

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

// Schema for validating task event IDs
const taskEventIdSchema = z.string()
  .regex(
    /^task_\d+_\d+$/,
    "Invalid task event ID format. Expected format: task_<timestamp>_<sequence>",
  );
// Schema for tool approval
const toolApproveSchema = z.object({
  approved: z.boolean(),
});

// Schema for query parameters in reconnection
const streamReconnectQuerySchema = z.object({
  lastEventId: taskEventIdSchema.optional(),
});

// Schema for headers in reconnection
const streamReconnectHeaderSchema = z.object({
  "last-event-id": taskEventIdSchema.optional(),
});

/**
 * Determines if a given event occurred after another event with the specified ID
 * by comparing their timestamps and sequence numbers.
 *
 * @param event The event to check
 * @param eventId The reference event ID to compare against
 * @returns true if the event occurred after the event with eventId, false otherwise
 * @throws Error if either ID doesn't match the expected format task_<timestamp>_<sequence>
 */
function isEventAfterId(event: TaskEvent, eventId: string): boolean {
  // Create TaskEventId objects from both IDs
  const currentId = new TaskEventId(event.data.eventId);
  const referenceId = new TaskEventId(eventId);

  // Use the built-in comparison method
  return currentId.isAfter(referenceId);
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

export function createAgentRouter(agent: ZypherAgent): Hono {
  let taskAbortController: AbortController | null = null;
  let taskEventSubject: ReplaySubject<TaskEvent> | null = null;
  let toolApprovalCompletor: Completor<boolean> | null = null;

  // Get agent messages
  agentRouter.get("/messages", (c) => {
    return c.json(agent.messages);
  });

  // Clear agent messages
  agentRouter.delete("/messages", (c) => {
    agent.clearMessages();
    return c.body(null, 204);
  });

  // Cancel the current task
  agentRouter.post("/task/cancel", (c) => {
    // Check if a task is running
    if (!agent.isTaskRunning) {
      throw new ApiError(
        404,
        "task_not_running",
        "No task was running to cancel",
      );
    }

    if (!taskAbortController) {
      throw new Error("Agent is running, but no abort controller found");
    }

    // Task is running, cancel it by aborting the controller
    taskAbortController.abort();
    taskAbortController = null;
    console.log("Task cancellation requested by user via API");

    // TODO: abort signal does not guarantee the task will be cancelled immediately,
    //       so we need to wait until the task is actually cancelled

    return c.body(null, 204);
  });

  function runAgentTask(
    agent: ZypherAgent,
    taskPrompt: string,
    imageAttachments: ZypherImageAttachment[],
    options: {
      signal?: AbortSignal;
    },
  ): ReplaySubject<TaskEvent> {
    const taskEvent$ = new Observable<TaskEvent>((subscriber) => {
      // Set up streaming handler for the agent
      const streamHandler: StreamHandler = {
        onContent: (content, _isFirstChunk) => {
          subscriber.next({
            event: "content_delta",
            data: {
              eventId: TaskEventId.generate().toString(),
              content,
            },
          });
        },
        onToolUse: (name, partialInput) => {
          subscriber.next({
            event: "tool_use_delta",
            data: {
              eventId: TaskEventId.generate().toString(),
              name,
              partialInput,
            },
          });
        },
        onMessage: (message) => {
          subscriber.next({
            event: "message",
            data: {
              eventId: TaskEventId.generate().toString(),
              message,
            },
          });
        },
        onCancelled: (reason) => {
          subscriber.next({
            event: "cancelled",
            data: {
              eventId: TaskEventId.generate().toString(),
              reason,
            },
          });
        },
      };

      agent
        .runTaskWithStreaming(
          taskPrompt,
          streamHandler,
          imageAttachments,
          {
            signal: options.signal,
            handleToolApproval: (_toolName, _args, options) => {
              subscriber.next({
                event: "tool_approval_pending",
                data: {
                  eventId: TaskEventId.generate().toString(),
                  toolName: _toolName,
                },
              });
              toolApprovalCompletor = new Completor<boolean>();
              return toolApprovalCompletor.wait(options);
            },
          },
        )
        .then(() => {
          subscriber.complete();
        })
        .catch((error) => {
          subscriber.next({
            event: "error",
            data: {
              eventId: TaskEventId.generate().toString(),
              error: formatError(error),
            },
          });
          subscriber.complete();
        });
    });

    // 30 seconds heartbeat
    return withReplayAndHeartbeat(taskEvent$, 30000);
  }

  // Run a task
  agentRouter.post("/task/sse", zValidator("json", taskSchema), (c) => {
    const { task, imageAttachments } = c.req.valid("json");
    const processedImages: ZypherImageAttachment[] = imageAttachments
      ? processImages(imageAttachments)
      : [];

    if (taskAbortController || taskEventSubject) {
      throw new ApiError(
        409,
        "task_in_progress",
        "A task is already running",
      );
    }

    const abortController = taskAbortController ??= new AbortController();
    const eventSubject = taskEventSubject ??= runAgentTask(
      agent,
      task,
      processedImages,
      { signal: abortController.signal },
    );

    return streamSSE(
      c,
      async (stream) => {
        for await (const event of eachValueFrom(eventSubject)) {
          await stream.writeSSE({
            event: event.event,
            data: JSON.stringify(event.data),
          });
        }

        taskEventSubject = null;
        taskAbortController = null;
      },
    );
  });

  // Add a new GET endpoint for stream reconnection
  agentRouter.get(
    "/task/sse",
    zValidator("query", streamReconnectQuerySchema),
    zValidator("header", streamReconnectHeaderSchema),
    (c) => {
      // First try to get lastEventId from standard Last-Event-ID header (now validated), then fallback to query param
      const lastEventId = c.req.valid("header")["last-event-id"] ??
        c.req.valid("query").lastEventId;

      // If task is not running, return 204 No Content
      if (!taskEventSubject || !taskAbortController) {
        return c.body(null, 204);
      }

      const eventSubject = taskEventSubject;

      return streamSSE(
        c,
        async (stream) => {
          const events = eventSubject
            .asObservable()
            .pipe(
              filter((event) =>
                lastEventId ? isEventAfterId(event, lastEventId) : true
              ),
            );

          for await (const event of eachValueFrom(events)) {
            await stream.writeSSE({
              event: event.event,
              data: JSON.stringify(event.data),
            });
          }
        },
      );
    },
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

  // Approve or reject a pending tool call via API
  agentRouter.post(
    "/tool-approve",
    zValidator("json", toolApproveSchema),
    (c) => {
      const { approved } = c.req.valid("json");
      if (!toolApprovalCompletor) {
        throw new ApiError(
          400,
          "no_tool_approval_pending",
          "No tool approval pending",
        );
      }
      // Log user decision - frontend can use this decision to reconnect
      console.log(
        `Tool approval decision received: ${
          approved ? "approved" : "rejected"
        }`,
      );
      toolApprovalCompletor.resolve(approved);
      toolApprovalCompletor = null;
      return c.json({
        success: true,
        approved,
        message: `Tool ${
          approved ? "approved" : "rejected"
        }. Please reconnect to continue receiving events.`,
      });
    },
  );

  return agentRouter;
}
