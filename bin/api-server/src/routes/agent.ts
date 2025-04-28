import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { listCheckpoints } from "../../../../src/checkpoints.ts";
import {
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
import { FileAttachment } from "../../../../src/message.ts";

const agentRouter = new Hono();

// Zod Schemas
const fileIdSchema = z.string().min(1, "File ID cannot be empty");
const taskSchema = z.object({
  task: z.string(),
  fileAttachments: z.array(fileIdSchema).optional(),
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

function runAgentTask(
  agent: ZypherAgent,
  taskPrompt: string,
  fileAttachments?: FileAttachment[],
  options?: { signal?: AbortSignal },
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
        fileAttachments,
        {
          signal: options?.signal,
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

export function createAgentRouter(agent: ZypherAgent): Hono {
  let taskAbortController: AbortController | null = null;
  let taskEventSubject: ReplaySubject<TaskEvent> | null = null;

  // Run a task
  agentRouter.post("/task/sse", zValidator("json", taskSchema), async (c) => {
    const { task, fileAttachments: fileAttachmentIds } = c.req.valid("json");

    const fileAttachments: FileAttachment[] | undefined = fileAttachmentIds
      ? (
        await Promise.all(
          fileAttachmentIds.map((id) => agent.getFileAttachment(id)),
        )
      )
        .filter((attachment): attachment is FileAttachment =>
          attachment !== null
        )
      : undefined;

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
      fileAttachments,
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

  return agentRouter;
}
