import type {
  BaseEvent,
  CustomEvent,
  Message,
  MessagesSnapshotEvent,
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  StateSnapshotEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  TextMessageStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
} from "@ag-ui/core";
import { EventType } from "@ag-ui/core";
import type { TaskEvent } from "@zypher/agent";
import type { EventContext } from "./adapter.ts";

export function convertTaskEvent(
  event: TaskEvent,
  context: EventContext,
): BaseEvent[] {
  const events: BaseEvent[] = [];
  const timestamp = Date.now();

  switch (event.type) {
    case "text": {
      if (!context.textMessageStarted) {
        // Generate new messageId for each new text message to avoid duplicate React keys
        context.messageId = crypto.randomUUID();
        context.textMessageStarted = true;
        const startEvent = {
          type: EventType.TEXT_MESSAGE_START,
          messageId: context.messageId,
          role: "assistant",
          timestamp,
        } satisfies TextMessageStartEvent;
        events.push(startEvent);
      }
      const contentEvent = {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: context.messageId,
        delta: event.content,
        timestamp,
      } satisfies TextMessageContentEvent;
      events.push(contentEvent);
      break;
    }

    case "tool_use": {
      // Use the toolUseId from the event instead of generating a new one
      const toolCallId = event.toolUseId;
      // Store by toolUseId for later lookup by tool_use_input/result events
      context.toolCallIds.set(event.toolUseId, toolCallId);

      if (context.textMessageStarted) {
        const endEvent = {
          type: EventType.TEXT_MESSAGE_END,
          messageId: context.messageId,
          timestamp,
        } satisfies TextMessageEndEvent;
        events.push(endEvent);
        context.textMessageStarted = false;
      }

      // Generate a new messageId for each tool call to avoid duplicate React keys
      context.messageId = crypto.randomUUID();

      const toolStartEvent = {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: event.toolName,
        parentMessageId: context.messageId,
        timestamp,
      } satisfies ToolCallStartEvent;
      events.push(toolStartEvent);
      break;
    }

    case "tool_use_input": {
      // Look up by toolUseId
      const toolCallId = context.toolCallIds.get(event.toolUseId);
      if (toolCallId) {
        const argsEvent = {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          delta: event.partialInput,
          timestamp,
        } satisfies ToolCallArgsEvent;
        events.push(argsEvent);
      }
      break;
    }

    case "tool_use_result": {
      // Look up by toolUseId, fall back to event.toolUseId if not found
      const toolCallId =
        context.toolCallIds.get(event.toolUseId) ?? event.toolUseId;

      const toolEndEvent = {
        type: EventType.TOOL_CALL_END,
        toolCallId,
        timestamp,
      } satisfies ToolCallEndEvent;
      events.push(toolEndEvent);

      let resultContent: string;
      if (typeof event.result === "string") {
        resultContent = event.result;
      } else if (event.result.content && Array.isArray(event.result.content)) {
        resultContent = event.result.content
          .filter(
            (c): c is { type: "text"; text: string } =>
              typeof c === "object" && c !== null && c.type === "text",
          )
          .map((c) => c.text)
          .join("\n");
      } else {
        resultContent = JSON.stringify(event.result);
      }

      // Tool result message needs its own unique messageId
      const toolResultMessageId = crypto.randomUUID();
      const toolResultEvent = {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId,
        messageId: toolResultMessageId,
        content: resultContent,
        timestamp,
      } satisfies ToolCallResultEvent;
      events.push(toolResultEvent);
      break;
    }

    case "tool_use_error": {
      // Look up by toolUseId, fall back to event.toolUseId if not found
      const toolCallId =
        context.toolCallIds.get(event.toolUseId) ?? event.toolUseId;

      const toolEndEvent = {
        type: EventType.TOOL_CALL_END,
        toolCallId,
        timestamp,
      } satisfies ToolCallEndEvent;
      events.push(toolEndEvent);

      // Tool error message needs its own unique messageId
      const toolErrorMessageId = crypto.randomUUID();
      const toolErrorEvent = {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId,
        messageId: toolErrorMessageId,
        content: `Error: ${String(event.error)}`,
        timestamp,
      } satisfies ToolCallResultEvent;
      events.push(toolErrorEvent);
      break;
    }

    case "completed": {
      if (context.textMessageStarted) {
        const endEvent = {
          type: EventType.TEXT_MESSAGE_END,
          messageId: context.messageId,
          timestamp,
        } satisfies TextMessageEndEvent;
        events.push(endEvent);
        context.textMessageStarted = false;
      }
      break;
    }

    case "cancelled": {
      if (context.textMessageStarted) {
        const endEvent = {
          type: EventType.TEXT_MESSAGE_END,
          messageId: context.messageId,
          timestamp,
        } satisfies TextMessageEndEvent;
        events.push(endEvent);
        context.textMessageStarted = false;
      }
      const errorEvent = {
        type: EventType.RUN_ERROR,
        message: `Task cancelled: ${event.reason}`,
        code: "CANCELLED",
        timestamp,
      } satisfies RunErrorEvent;
      events.push(errorEvent);
      break;
    }

    case "usage": {
      const customEvent = {
        type: EventType.CUSTOM,
        name: "usage",
        value: {
          usage: event.usage,
          cumulativeUsage: event.cumulativeUsage,
        },
        timestamp,
      } satisfies CustomEvent;
      events.push(customEvent);
      break;
    }

    case "message":
    case "history_changed":
    case "tool_use_pending_approval":
    case "tool_use_rejected":
    case "tool_use_approved":
      break;
  }

  return events;
}

export function createRunStartedEvent(
  threadId: string,
  runId: string,
): BaseEvent {
  const event = {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
    timestamp: Date.now(),
  } satisfies RunStartedEvent;
  return event;
}

export function createRunFinishedEvent(
  threadId: string,
  runId: string,
): BaseEvent {
  const event = {
    type: EventType.RUN_FINISHED,
    threadId,
    runId,
    timestamp: Date.now(),
  } satisfies RunFinishedEvent;
  return event;
}

export function createRunErrorEvent(message: string, code?: string): BaseEvent {
  const event = {
    type: EventType.RUN_ERROR,
    message,
    code,
    timestamp: Date.now(),
  } satisfies RunErrorEvent;
  return event;
}

export function createMessagesSnapshotEvent(messages: Message[]): BaseEvent {
  const event = {
    type: EventType.MESSAGES_SNAPSHOT,
    messages,
    timestamp: Date.now(),
  } satisfies MessagesSnapshotEvent;
  return event;
}

export function createStateSnapshotEvent(
  snapshot: Record<string, unknown>,
): BaseEvent {
  const event = {
    type: EventType.STATE_SNAPSHOT,
    snapshot,
    timestamp: Date.now(),
  } satisfies StateSnapshotEvent;
  return event;
}
