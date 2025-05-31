import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { listCheckpoints } from "../../../../src/checkpoints.ts";
import {
  type StreamHandler,
  ZypherAgent,
} from "../../../../src/ZypherAgent.ts";
import { ApiError } from "../error.ts";
import {
  replayTaskEvents,
  type TaskEvent,
  TaskEventId,
  withTaskEventReplayAndHeartbeat,
} from "../taskEvents.ts";
import { Observable, ReplaySubject } from "rxjs";
import { map } from "rxjs/operators";
import { eachValueFrom } from "rxjs-for-await";
import { FileAttachment } from "../../../../src/message.ts";
import { Completer } from "../../../../src/utils/mod.ts";

const agentRouter = new Hono();

// Zod Schemas
const fileIdSchema = z.string().min(1, "File ID cannot be empty");
const taskSchema = z.object({
  task: z.string(),
  model: z.enum([
    "claude-3-5-sonnet-20241022",
    "claude-3-7-sonnet-20250219",
    "claude-sonnet-4-20250514"
  ]).optional(),
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

export function createAgentRouter(agent: ZypherAgent): Hono {
  let taskAbortController: AbortController | null = null;
  let taskEventSubject: ReplaySubject<TaskEvent> | null = null;
  let toolApprovalCompletor: Completer<boolean> | null = null;
  let serverLatestEventId: TaskEventId | undefined = undefined;

  function runAgentTask(
    agent: ZypherAgent,
    taskPrompt: string,
    fileAttachments?: FileAttachment[],
    model?: string,
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

      if (model) {
        agent.model = model;
      } else {
        // Fallback to Claude 3.7 Sonnet
        agent.model = "claude-3-7-sonnet-20250219";
      }

      agent
        .runTaskWithStreaming(
          taskPrompt,
          streamHandler,
          fileAttachments,
          {
            signal: options?.signal,
            handleToolApproval: async (_toolName, _args, options) => {
              // TODO: Auto approval everything for now until DEC-48 is resolved (approval UI)
              const shouldAutoApprove: boolean = true;
              // TODO: logic to determine if we should auto approve a tool call
              if (shouldAutoApprove) {
                return true;
              }

              toolApprovalCompletor = new Completer<boolean>();
              subscriber.next({
                event: "tool_approval_pending",
                data: {
                  eventId: TaskEventId.generate().toString(),
                  toolName: _toolName,
                  args: _args,
                },
              });
              return await toolApprovalCompletor.wait(options);
            },
          },
        )
        .then(() => {
          subscriber.next({
            event: "complete",
            data: {
              eventId: TaskEventId.generate().toString(),
            },
          });
          subscriber.complete();
        })
        .catch((error) => {
          console.error("Error during agent task execution:", error);
          subscriber.next({
            event: "error",
            data: {
              eventId: TaskEventId.generate().toString(),
              error: "Internal server error during agent task execution.",
            },
          });
          subscriber.complete();
        });
    })
      .pipe(
        map((event) => {
          serverLatestEventId = new TaskEventId(event.data.eventId);
          return event;
        }),
      );

    // 30 seconds heartbeat
    return withTaskEventReplayAndHeartbeat(taskEvent$, 30000);
  }

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
  agentRouter.post("/task/cancel", async (c) => {
    // Check if a task is running
    if (!agent.isTaskRunning) {
      throw new ApiError(
        404,
        "task_not_running",
        "No task was running to cancel",
      );
    }

    if (!taskAbortController || !taskEventSubject) {
      throw new Error(
        "Agent is running, but no abort controller or event subject found",
      );
    }

    // Task is running, cancel it by aborting the controller
    taskAbortController.abort();
    taskAbortController = null;
    console.log("Task cancellation requested by user via API");

    // abort signal does not guarantee the task will be cancelled immediately,
    // so we need to wait until the task is actually cancelled
    await agent.wait();

    return c.body(null, 204);
  });

  // Run a task
  agentRouter.post("/task/sse", zValidator("json", taskSchema), async (c) => {
    const { task, model, fileAttachments: fileAttachmentIds } = c.req.valid("json");

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
      model,
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
          const events = replayTaskEvents(
            eventSubject,
            serverLatestEventId,
            lastEventId ? new TaskEventId(lastEventId) : undefined,
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
          409,
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
      return c.body(null, 204);
    },
  );

  return agentRouter;
}
