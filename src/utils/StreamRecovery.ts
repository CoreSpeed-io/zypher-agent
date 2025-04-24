import { Observable, ReplaySubject, Subject } from "rxjs";
import { filter, takeUntil } from "rxjs/operators";

// Import TaskEvent type from the shared types file
import type { TaskEvent } from "../types/events.ts";

/**
 * Manager for task event streams that supports recovery after disconnection.
 * Uses RxJS to maintain a replayable event history that clients can reconnect to.
 */
export class TaskStreamManager {
  private currentTaskId: string | null = null;
  private eventSubject: ReplaySubject<TaskEvent> | null = null;
  private taskEndSubject: Subject<void> = new Subject<void>();
  private heartbeatInterval: number | null = null;
  private taskInProgress: boolean = false; // Flag to track if task is still in progress

  /**
   * Start tracking a new task with the given ID.
   * Creates a new event buffer and sets up heartbeat mechanism.
   * @param taskId Unique identifier for the task
   */
  startTask(taskId: string): void {
    // End any previous task before starting a new one
    if (this.currentTaskId) {
      this.endTask();
    }

    this.currentTaskId = taskId;
    // Create a ReplaySubject without buffer size limit to store all events
    this.eventSubject = new ReplaySubject<TaskEvent>();
    // Create a new taskEndSubject for this task
    this.taskEndSubject = new Subject<void>();
    // Set task as in progress
    this.taskInProgress = true;

    // Start heartbeat only if task is in progress
    this.startHeartbeat();
  }

  /**
   * Start the heartbeat mechanism to keep the connection alive
   */
  private startHeartbeat(): void {
    // Clear any existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Only start if task is in progress
    if (!this.taskInProgress) return;

    this.heartbeatInterval = setInterval(() => {
      if (this.taskInProgress) {
        this.addEvent({
          event: "heartbeat",
          data: { timestamp: Date.now() },
        } as TaskEvent);
      } else if (this.heartbeatInterval) {
        // Stop heartbeat if task is no longer in progress
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    }, 15000);
  }

  /**
   * Mark the task as completed or cancelled, but keep the event stream available for reconnections.
   * Stops sending heartbeats but maintains the event subject for retrieval.
   */
  markTaskComplete(): void {
    this.taskInProgress = false;

    // Stop heartbeat but keep event stream
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * End the current task and clean up resources.
   * Stops the heartbeat and notifies all observers.
   * This should be called when starting a new task or when the manager is no longer needed.
   */
  endTask(): void {
    this.taskInProgress = false;

    if (this.eventSubject) {
      this.taskEndSubject.next();
      this.taskEndSubject.complete();

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    }

    this.currentTaskId = null;
    this.eventSubject = null;
  }

  /**
   * Check if a task is currently running.
   * @returns true if a task is running, false otherwise
   */
  isTaskRunning(): boolean {
    return this.taskInProgress;
  }

  /**
   * Check if a task event stream is available (even if task is complete).
   * @returns true if event stream exists, false otherwise
   */
  hasEventStream(): boolean {
    return this.currentTaskId !== null && this.eventSubject !== null;
  }

  /**
   * Add an event to the current task's event stream.
   * Automatically adds an eventId to the data field.
   * @param event The task event to add
   * @returns The same event with eventId added to data, or null if no task stream is available
   */
  addEvent(event: TaskEvent): TaskEvent | null {
    if (!this.eventSubject) return null;

    // Create a deep copy of the event to avoid modifying the original
    const eventCopy = JSON.parse(JSON.stringify(event)) as TaskEvent;

    // Add timestamp-based eventId to the data field
    if (typeof eventCopy.data !== "object" || eventCopy.data === null) {
      eventCopy.data = {
        value: eventCopy.data,
        eventId: Date.now().toString(),
      };
    } else {
      (eventCopy.data as Record<string, unknown>).eventId = Date.now()
        .toString();
    }

    // Add the event to the subject
    this.eventSubject.next(eventCopy);

    // If this is a complete or cancelled event, mark task as complete
    if (event.event === "complete" || event.event === "cancelled") {
      this.markTaskComplete();
    }

    // Return the event with the added eventId
    return eventCopy;
  }

  /**
   * Get an observable of events for the current task,
   * optionally filtered to only include events after the given event ID.
   * @param lastEventId Optional ID of the last event received by the client
   * @returns Observable stream of task events
   */
  getEventStream(lastEventId?: string): Observable<TaskEvent> {
    if (!this.eventSubject) {
      return new Observable<TaskEvent>();
    }

    return this.eventSubject.pipe(
      // Filter events based on event ID
      filter((event) => {
        if (!lastEventId) return true;

        // Extract eventId from data field
        const eventId = typeof event.data === "object" && event.data &&
            "eventId" in event.data
          ? String(event.data.eventId)
          : "";

        // Convert to numbers for proper comparison
        const currentId = Number(eventId);
        const lastId = Number(lastEventId);

        // Compare numerically (not lexicographically)
        return !isNaN(currentId) && !isNaN(lastId) && currentId > lastId;
      }),
      takeUntil(this.taskEndSubject),
    );
  }
}

// Global singleton instance
export const taskStreamManager = new TaskStreamManager();
