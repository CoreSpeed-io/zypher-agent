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
import { type TaskEvent, TaskEventId } from "../taskEvents.ts";
import { ReplaySubject } from "rxjs";
import { filter } from "rxjs/operators";
import { eachValueFrom } from "rxjs-for-await";

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

const imageSchema = z.object({
  name: z.string(),
  data: base64ImageSchema,
});
type ImageAttachment = z.infer<typeof imageSchema>;

const taskSchema = z.object({
  task: z.string(),
  imageAttachments: z.array(imageSchema).optional(),
});

const checkpointParamsSchema = z.object({
  checkpointId: z.string().min(1, "Checkpoint ID cannot be empty"),
});

const streamReconnectSchema = z.object({
  lastEventId: z.string().optional(),
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

function runAgentTask(
  agent: ZypherAgent,
  taskPrompt: string,
  imageAttachments: ZypherImageAttachment[],
  options: { signal?: AbortSignal },
): ReplaySubject<TaskEvent> {
  const eventSubject = new ReplaySubject<TaskEvent>();

  // Set up streaming handler for the agent
  const streamHandler: StreamHandler = {
    onContent: (content, _isFirstChunk) => {
      eventSubject.next({
        event: "content_delta",
        data: {
          eventId: TaskEventId.generate().toString(),
          content,
        },
      });
    },
    onToolUse: (name, partialInput) => {
      eventSubject.next({
        event: "tool_use_delta",
        data: {
          eventId: TaskEventId.generate().toString(),
          name,
          partialInput,
        },
      });
    },
    onMessage: (message) => {
      eventSubject.next({
        event: "message",
        data: {
          eventId: TaskEventId.generate().toString(),
          message,
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
      },
    )
    .then(() => {
      eventSubject.complete();
    })
    .catch((error) => {
      eventSubject.next({
        event: "error",
        data: {
          eventId: TaskEventId.generate().toString(),
          error: formatError(error),
        },
      });
      eventSubject.complete();
    });

  return eventSubject;
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
  agentRouter.get("/task/cancel", (c) => {
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

    return c.json({
      success: true,
      message: "Task cancelled successfully",
      status: "idle",
    });
  });

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
    zValidator("query", streamReconnectSchema),
    (c) => {
      // First try to get lastEventId from standard Last-Event-ID header, then fallback to query param
      const headerLastEventId = c.req.header("last-event-id");
      const queryLastEventId = c.req.valid("query").lastEventId;
      const lastEventId = headerLastEventId ?? queryLastEventId;

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

  return agentRouter;
}
