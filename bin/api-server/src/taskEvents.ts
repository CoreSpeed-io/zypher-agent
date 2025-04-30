import type { Message } from "../../../src/message.ts";
import { filter, Observable, ReplaySubject } from "rxjs";

/**
 * Base event data that all event types must include
 */
export interface BaseEventData {
  eventId: string;
}

/**
 * Content delta event data
 */
export interface ContentDeltaEventData extends BaseEventData {
  content: string;
}

/**
 * Tool use delta event data
 */
export interface ToolUseDeltaEventData extends BaseEventData {
  name: string;
  partialInput: string;
}

/**
 * Message event data
 */
export interface MessageEventData extends BaseEventData {
  message: Message;
}

/**
 * Error event data
 */
export interface ErrorEventData extends BaseEventData {
  error: string;
}

/**
 * Complete event data
 */
export interface CompleteEventData extends BaseEventData {
  // No additional fields for complete events
}

/**
 * Cancelled event data
 */
export interface CancelledEventData extends BaseEventData {
  reason: "user" | "timeout";
}

/**
 * Heartbeat event data
 */
export interface HeartbeatEventData extends BaseEventData {
  timestamp: number;
}

/**
 * Tool approval pending event data
 */
export interface ToolApprovalPendingEventData extends BaseEventData {
  toolName: string;
  args: unknown;
}
/**
 * Event types for task execution events using discriminated union types
 */
export type TaskEvent =
  | { event: "content_delta"; data: ContentDeltaEventData }
  | { event: "tool_use_delta"; data: ToolUseDeltaEventData }
  | { event: "message"; data: MessageEventData }
  | { event: "heartbeat"; data: HeartbeatEventData }
  | { event: "error"; data: ErrorEventData }
  | { event: "complete"; data: CompleteEventData }
  | { event: "cancelled"; data: CancelledEventData }
  | { event: "tool_approval_pending"; data: ToolApprovalPendingEventData };

/**
 * Represents a unique identifier for task events with timestamp and sequence components.
 * Format: task_<timestamp>_<sequence>
 */
export class TaskEventId {
  // Static state to maintain uniqueness across instances
  static #lastTimestamp: number = 0;
  static #currentSequence: number = 0;
  #timestamp: number;
  #sequence: number;
  #raw: string;

  /**
   * Creates a TaskEventId from a string representation
   * @param rawId The string representation of the ID in format task_<timestamp>_<sequence>
   * @throws Error if the format is invalid
   */
  constructor(rawId: string) {
    this.#raw = rawId;
    const match = rawId.match(/^task_(\d+)_(\d+)$/);

    if (!match) {
      throw new Error(
        `Invalid event ID format: ${rawId}. Expected format: task_<timestamp>_<sequence>`,
      );
    }

    this.#timestamp = parseInt(match[1], 10);
    this.#sequence = parseInt(match[2], 10);
  }

  /**
   * Creates a new TaskEventId with the current timestamp and an appropriate sequence number
   */
  static generate(): TaskEventId {
    return TaskEventId.generateWithTimestamp(Date.now());
  }

  /**
   * Creates a new TaskEventId with the specified timestamp and an appropriate sequence number
   * This is primarily useful for testing or when you need to create an ID with a specific timestamp
   */
  static generateWithTimestamp(timestamp: number): TaskEventId {
    // Keep track of last timestamp and sequence for uniqueness
    if (timestamp === TaskEventId.#lastTimestamp) {
      TaskEventId.#currentSequence++;
    } else {
      TaskEventId.#lastTimestamp = timestamp;
      TaskEventId.#currentSequence = 0;
    }

    return new TaskEventId(`task_${timestamp}_${TaskEventId.#currentSequence}`);
  }

  /**
   * Returns the raw string representation of the ID
   */
  toString(): string {
    return this.#raw;
  }

  /**
   * Checks if this event ID is chronologically after another event ID
   * @param other The other TaskEventId to compare with
   * @returns true if this event occurred after the other event
   */
  isAfter(other: TaskEventId): boolean {
    if (this.#timestamp > other.#timestamp) {
      return true;
    }

    return this.#timestamp === other.#timestamp &&
      this.#sequence > other.#sequence;
  }

  /**
   * Gets the timestamp component of the ID
   */
  get timestamp(): number {
    return this.#timestamp;
  }

  /**
   * Gets the sequence component of the ID
   */
  get sequence(): number {
    return this.#sequence;
  }
}

/**
 * Adds heartbeat events to an Observable during periods of inactivity
 * @template T The type of events in the source Observable
 * @param source The source Observable
 * @param heartbeatInterval The interval in milliseconds to wait before emitting a heartbeat
 * @param createHeartbeatFn Function to create a heartbeat event
 * @returns An Observable that includes the original events plus heartbeat events
 */
export function withHeartbeat<T>(
  source: Observable<T>,
  heartbeatInterval: number,
  createHeartbeatFn: () => T,
): Observable<T> {
  return new Observable<T>((observer) => {
    let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;

    // Function to schedule the next heartbeat
    const scheduleHeartbeat = () => {
      // Clear any existing timeout
      if (heartbeatTimeout !== null) {
        clearTimeout(heartbeatTimeout);
      }

      // Schedule a new heartbeat
      heartbeatTimeout = setTimeout(() => {
        const heartbeatEvent = createHeartbeatFn();
        observer.next(heartbeatEvent);

        // Schedule the next heartbeat
        scheduleHeartbeat();
      }, heartbeatInterval);
    };

    // Start the heartbeat scheduling
    scheduleHeartbeat();

    // Subscribe to the source and forward events
    const subscription = source.subscribe({
      next: (event) => {
        // Forward the event
        observer.next(event);

        // Reset the heartbeat timer
        scheduleHeartbeat();
      },
      error: (err) => {
        if (heartbeatTimeout !== null) {
          clearTimeout(heartbeatTimeout);
        }
        observer.error(err);
      },
      complete: () => {
        if (heartbeatTimeout !== null) {
          clearTimeout(heartbeatTimeout);
        }
        observer.complete();
      },
    });

    // Return cleanup function
    return () => {
      subscription.unsubscribe();
      if (heartbeatTimeout !== null) {
        clearTimeout(heartbeatTimeout);
      }
    };
  });
}

/**
 * Converts an Observable to a ReplaySubject that will replay all events to new subscribers
 * @template T The type of events in the source Observable
 * @param source The source Observable
 * @returns A ReplaySubject that replays all events to new subscribers
 */
export function withReplay<T>(source: Observable<T>): ReplaySubject<T> {
  const subject = new ReplaySubject<T>();

  // Subscribe the subject directly to the source
  source.subscribe(subject);

  return subject;
}

/**
 * Creates a task heartbeat event
 * @returns A heartbeat TaskEvent
 */
export function createTaskHeartbeat(): TaskEvent {
  return {
    event: "heartbeat",
    data: {
      eventId: TaskEventId.generate().toString(),
      timestamp: Date.now(),
    },
  };
}

/**
 * Creates a ReplaySubject from an Observable that emits heartbeat events during periods of inactivity
 * @param source The source Observable of TaskEvent objects
 * @param heartbeatInterval The interval in milliseconds to wait before emitting a heartbeat
 * @returns A ReplaySubject that replays all events including added heartbeats
 */
export function withTaskEventReplayAndHeartbeat(
  source: Observable<TaskEvent>,
  heartbeatInterval: number,
): ReplaySubject<TaskEvent> {
  // First add heartbeat events, then convert to a ReplaySubject
  return withReplay(
    withHeartbeat(source, heartbeatInterval, createTaskHeartbeat),
  );
}

/**
 * Filters events from a ReplaySubject to replay only events that occurred after
 * a specified event ID (if provided) and filters out stale pending approval events.
 *
 * @param source The ReplaySubject containing the events to replay
 * @param serverLatestEventId The ID of the most recent event produced by the server at the moment
 * when this function is called. This is used to filter out stale pending approval events.
 * Pending approval events are those that occurred after the clientLastEventId but before the serverLatestEventId.
 * @param clientLastEventId The ID of the last event that was received by the client
 * @returns An Observable that emits only events that occurred after the specified event ID
 */
export function replayTaskEvents(
  source: ReplaySubject<TaskEvent>,
  serverLatestEventId?: TaskEventId,
  clientLastEventId?: TaskEventId,
): Observable<TaskEvent> {
  return source
    .asObservable()
    .pipe(
      // First filter: only include events after clientLastEventId (if provided)
      filter((event) =>
        clientLastEventId
          ? new TaskEventId(event.data.eventId).isAfter(clientLastEventId)
          : true
      ),
      // Second filter: filter out stale pending approval events
      filter((event) => {
        // Only apply this filter to tool_approval_pending events when serverLatestEventId is provided
        if (serverLatestEventId && event.event === "tool_approval_pending") {
          // Create TaskEventId objects for comparison
          const eventId = new TaskEventId(event.data.eventId);

          // Keep the event if it's newer than or equal to the server's latest event
          // (i.e., filter out stale pending approval events that happened before the server's latest event)
          return !serverLatestEventId.isAfter(eventId);
        }
        // Keep all other event types
        return true;
      }),
    );
}
