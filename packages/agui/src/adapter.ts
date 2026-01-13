/**
 * AG-UI Adapter for ZypherAgent
 *
 * Transport-agnostic event streaming with RxJS Observable.
 *
 * @example
 * ```typescript
 * import { createAguiEventStream, parseRunAgentInput } from "./adapter.ts";
 * import type { Message } from "@ag-ui/core";
 *
 * const input = parseRunAgentInput(await request.json());
 * const events$ = createAguiEventStream({
 *   agent,
 *   messages: input.messages as Message[],
 *   threadId: input.threadId ?? crypto.randomUUID(),
 *   runId: input.runId ?? crypto.randomUUID(),
 *   model: "claude-sonnet-4-20250514",
 * });
 *
 * // Use with any transport (SSE, WebSocket, etc.)
 * events$.subscribe(event => console.log(event));
 * ```
 */

import { RunAgentInputSchema } from "@ag-ui/core";
import type { BaseEvent, Message, RunAgentInput } from "@ag-ui/core";
import { concatMap, from, Observable } from "rxjs";

import { formatError, type ZypherAgent } from "@zypher/agent";
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

/**
 * Options for creating a transport-agnostic AG-UI event stream.
 */
export interface AguiEventStreamOptions {
  /** The ZypherAgent instance to use */
  agent: ZypherAgent;
  messages: Message[];
  model: string;
  threadId: string;
  runId: string;
  state?: Record<string, unknown>;
}

/**
 * Create a transport-agnostic AG-UI event stream.
 *
 * @param options - Event stream configuration
 * @returns Observable stream of AG-UI BaseEvent
 */
export function createAguiEventStream(
  options: AguiEventStreamOptions,
): Observable<BaseEvent> {
  const { agent, messages, state, threadId, runId, model } = options;
  const eventContext = createEventContext(threadId, runId);

  return new Observable<BaseEvent>((subscriber) => {
    // Emit run started event
    subscriber.next(createRunStartedEvent(threadId, runId));

    const taskDescription = extractTaskDescription(messages);
    const taskObservable = agent.runTask(taskDescription, model);

    const subscription = taskObservable
      .pipe(
        // Convert each TaskEvent to an array of BaseEvents, then flatten
        concatMap((event) => from(convertTaskEvent(event, eventContext))),
      )
      .subscribe({
        next: (event) => subscriber.next(event),
        error: (error) => {
          subscriber.next(createRunErrorEvent(formatError(error)));
          subscriber.complete();
        },
        complete: () => {
          // Emit final events
          const finalMessages = convertZypherMessagesToAgui(agent.messages);
          subscriber.next(createMessagesSnapshotEvent(finalMessages));

          if (state !== undefined) {
            subscriber.next(
              createStateSnapshotEvent({
                messageCount: agent.messages.length,
              }),
            );
          }

          subscriber.next(createRunFinishedEvent(threadId, runId));
          subscriber.complete();
        },
      });

    return () => subscription.unsubscribe();
  });
}
