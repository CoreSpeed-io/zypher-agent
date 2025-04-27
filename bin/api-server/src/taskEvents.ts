/**
 * Event types for task execution events
 */
export type TaskEvent = {
  event:
    | "content_delta"
    | "tool_use_delta"
    | "message"
    | "error"
    | "complete"
    | "cancelled"
    | "heartbeat";
  data: { eventId: string } & Record<string, unknown>;
};

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
