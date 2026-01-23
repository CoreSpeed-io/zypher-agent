const EVENT_ID_PATTERN = /^task_(\d+)_(\d+)$/;

export class TaskEventId {
  constructor(
    readonly timestamp: number,
    readonly sequence: number
  ) {}

  static parse(value: string): TaskEventId | null {
    const match = value.match(EVENT_ID_PATTERN);
    if (!match) return null;
    return new TaskEventId(parseInt(match[1], 10), parseInt(match[2], 10));
  }

  static generate(): TaskEventId {
    return new TaskEventId(Date.now(), 0);
  }

  isAfter(other: TaskEventId): boolean {
    if (this.timestamp !== other.timestamp) {
      return this.timestamp > other.timestamp;
    }
    return this.sequence > other.sequence;
  }

  toString(): string {
    return `task_${this.timestamp}_${this.sequence}`;
  }
}
