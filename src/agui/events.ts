import { EventType } from "@ag-ui/core";
import type { BaseEvent, Message } from "@ag-ui/core";
import type { TaskEvent } from "../TaskEvents.ts";
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
        context.textMessageStarted = true;
        events.push({
          type: EventType.TEXT_MESSAGE_START,
          messageId: context.messageId,
          role: "assistant",
          timestamp,
        } as BaseEvent);
      }
      events.push({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: context.messageId,
        delta: event.content,
        timestamp,
      } as BaseEvent);
      break;
    }

    case "tool_use": {
      const toolCallId = crypto.randomUUID();
      context.toolCallIds.set(event.toolName, toolCallId);

      if (context.textMessageStarted) {
        events.push({
          type: EventType.TEXT_MESSAGE_END,
          messageId: context.messageId,
          timestamp,
        } as BaseEvent);
        context.textMessageStarted = false;
        context.messageId = crypto.randomUUID();
      }

      events.push({
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: event.toolName,
        parentMessageId: context.messageId,
        timestamp,
      } as BaseEvent);
      break;
    }

    case "tool_use_input": {
      const toolCallId = context.toolCallIds.get(event.toolName);
      if (toolCallId) {
        events.push({
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          delta: event.partialInput,
          timestamp,
        } as BaseEvent);
      }
      break;
    }

    case "tool_use_result": {
      const toolCallId = context.toolCallIds.get(event.toolName) ??
        event.toolUseId;

      events.push({
        type: EventType.TOOL_CALL_END,
        toolCallId,
        timestamp,
      } as BaseEvent);

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

      events.push({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId,
        messageId: context.messageId,
        content: resultContent,
        timestamp,
      } as BaseEvent);
      break;
    }

    case "tool_use_error": {
      const toolCallId = context.toolCallIds.get(event.toolName) ??
        event.toolUseId;

      events.push({
        type: EventType.TOOL_CALL_END,
        toolCallId,
        timestamp,
      } as BaseEvent);

      events.push({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId,
        messageId: context.messageId,
        content: `Error: ${String(event.error)}`,
        timestamp,
      } as BaseEvent);
      break;
    }

    case "completed": {
      if (context.textMessageStarted) {
        events.push({
          type: EventType.TEXT_MESSAGE_END,
          messageId: context.messageId,
          timestamp,
        } as BaseEvent);
        context.textMessageStarted = false;
      }
      break;
    }

    case "cancelled": {
      if (context.textMessageStarted) {
        events.push({
          type: EventType.TEXT_MESSAGE_END,
          messageId: context.messageId,
          timestamp,
        } as BaseEvent);
        context.textMessageStarted = false;
      }
      events.push({
        type: EventType.RUN_ERROR,
        message: `Task cancelled: ${event.reason}`,
        code: "CANCELLED",
        timestamp,
      } as BaseEvent);
      break;
    }

    case "usage": {
      events.push({
        type: EventType.CUSTOM,
        name: "usage",
        value: {
          usage: event.usage,
          cumulativeUsage: event.cumulativeUsage,
        },
        timestamp,
      } as BaseEvent);
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
  threadId?: string,
  runId?: string,
): BaseEvent {
  return { type: EventType.RUN_STARTED, threadId, runId, timestamp: Date.now() } as BaseEvent;
}

export function createRunFinishedEvent(
  threadId?: string,
  runId?: string,
): BaseEvent {
  return { type: EventType.RUN_FINISHED, threadId, runId, timestamp: Date.now() } as BaseEvent;
}

export function createRunErrorEvent(message: string, code?: string): BaseEvent {
  return { type: EventType.RUN_ERROR, message, code, timestamp: Date.now() } as BaseEvent;
}

export function createMessagesSnapshotEvent(messages: Message[]): BaseEvent {
  return { type: EventType.MESSAGES_SNAPSHOT, messages, timestamp: Date.now() } as BaseEvent;
}

export function createStateSnapshotEvent(
  snapshot: Record<string, unknown>,
): BaseEvent {
  return { type: EventType.STATE_SNAPSHOT, snapshot, timestamp: Date.now() } as BaseEvent;
}
