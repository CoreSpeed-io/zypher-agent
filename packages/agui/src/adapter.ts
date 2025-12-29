/**
 * AG-UI Adapter for ZypherAgent
 *
 * @example
 * ```typescript
 * import { createAguiStream } from "./adapter.ts";
 *
 * const stream = createAguiStream(await request.json(), { agent });
 * return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
 * ```
 */

import { EventType, RunAgentInputSchema } from "@ag-ui/core";
import type { BaseEvent, Message, RunAgentInput } from "@ag-ui/core";
import { eachValueFrom } from "rxjs-for-await";

import type { ZypherAgent } from "@zypher/agent";
import {
  convertZypherMessagesToAgui,
  extractTaskDescription,
} from "./messages.ts";
import {
  convertTaskEvent,
  createMessagesSnapshotEvent,
  createRunErrorEvent,
  createRunFinishedEvent,
  createRunStartedEvent,
  createStateSnapshotEvent,
} from "./events.ts";

export interface EventContext {
  messageId: string;
  toolCallIds: Map<string, string>;
  textMessageStarted: boolean;
  threadId?: string;
  runId?: string;
}

export function createEventContext(
  threadId?: string,
  runId?: string,
): EventContext {
  return {
    messageId: crypto.randomUUID(),
    toolCallIds: new Map(),
    textMessageStarted: false,
    threadId,
    runId,
  };
}

export function parseRunAgentInput(body: unknown): RunAgentInput {
  return RunAgentInputSchema.parse(body);
}

export function encodeSSEStream(
  events: AsyncIterable<BaseEvent>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(formatSSEMessage(value)));
      } catch (error) {
        const errorEvent = {
          type: EventType.RUN_ERROR,
          message: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        } as BaseEvent;
        controller.enqueue(encoder.encode(formatSSEMessage(errorEvent)));
        controller.close();
      }
    },
    cancel() {
      iterator.return?.();
    },
  });
}

export function formatSSEMessage(event: BaseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export interface CreateAguiStreamOptions {
  agent: ZypherAgent;
  model?: string;
}

/**
 * Create an SSE stream from AG-UI request body.
 *
 * @param body - Raw request body (parsed JSON or string)
 * @param options - Agent and optional model configuration
 * @returns SSE-encoded ReadableStream
 */
export function createAguiStream(
  body: unknown,
  options: CreateAguiStreamOptions,
): ReadableStream<Uint8Array> {
  const parsed = typeof body === "string"
    ? parseRunAgentInput(JSON.parse(body))
    : parseRunAgentInput(body);

  return encodeSSEStream(
    runStream({
      agent: options.agent,
      messages: parsed.messages as Message[],
      state: parsed.state,
      threadId: parsed.threadId ?? crypto.randomUUID(),
      runId: parsed.runId ?? crypto.randomUUID(),
      model: options.model ?? Deno.env.get("ZYPHER_MODEL") ?? DEFAULT_MODEL,
    }),
  );
}

interface RunStreamOptions {
  agent: ZypherAgent;
  messages: Message[];
  state?: Record<string, unknown>;
  threadId: string;
  runId: string;
  model: string;
}

async function* runStream(
  options: RunStreamOptions,
): AsyncGenerator<BaseEvent> {
  const { agent, messages, state, threadId, runId, model } = options;

  yield createRunStartedEvent(threadId, runId);

  const eventContext = createEventContext(threadId, runId);

  try {
    // TODO: Use converted messages for context preservation
    // const zypherMessages = convertAGUIMessagesToZypher(messages);
    const taskDescription = extractTaskDescription(messages);
    const observable = agent.runTask(taskDescription, model);

    for await (const event of eachValueFrom(observable)) {
      for (const aguiEvent of convertTaskEvent(event, eventContext)) {
        yield aguiEvent;
      }
    }

    const finalMessages = convertZypherMessagesToAgui(agent.messages);
    yield createMessagesSnapshotEvent(finalMessages);

    if (state !== undefined) {
      yield createStateSnapshotEvent({
        messageCount: agent.messages.length,
      });
    }

    yield createRunFinishedEvent(threadId, runId);
  } catch (error) {
    yield createRunErrorEvent(
      error instanceof Error ? error.message : String(error),
    );
  }
}
