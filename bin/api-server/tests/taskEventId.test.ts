import { assertEquals, assertThrows } from "@std/assert";
import { TaskEventId } from "../src/taskEvents.ts";

Deno.test("TaskEventId - constructor should parse valid ID format", () => {
  const timestamp = 1650000000000;
  const sequence = 5;
  const id = new TaskEventId(`task_${timestamp}_${sequence}`);

  assertEquals(id.timestamp, timestamp);
  assertEquals(id.sequence, sequence);
  assertEquals(id.toString(), `task_${timestamp}_${sequence}`);
});

Deno.test("TaskEventId - constructor should throw on invalid format", () => {
  // Invalid prefix
  assertThrows(
    () => new TaskEventId("invalid_1650000000000_5"),
    Error,
    "Invalid event ID format",
  );

  // Missing sequence
  assertThrows(
    () => new TaskEventId("task_1650000000000"),
    Error,
    "Invalid event ID format",
  );

  // Non-numeric timestamp
  assertThrows(
    () => new TaskEventId("task_timestamp_5"),
    Error,
    "Invalid event ID format",
  );

  // Non-numeric sequence
  assertThrows(
    () => new TaskEventId("task_1650000000000_sequence"),
    Error,
    "Invalid event ID format",
  );
});

Deno.test("TaskEventId - generate should create unique IDs", () => {
  const id1 = TaskEventId.generate();
  const id2 = TaskEventId.generate();

  // IDs should be different
  const [timestamp1, sequence1] = parseIdParts(id1.toString());
  const [timestamp2, sequence2] = parseIdParts(id2.toString());

  // Either timestamps are different, or if they're the same, sequences should be different
  if (timestamp1 === timestamp2) {
    assertEquals(sequence2, sequence1 + 1);
  } else {
    assert(
      timestamp2 > timestamp1,
      "Second timestamp should be greater than first",
    );
  }
});

Deno.test("TaskEventId - isAfter should correctly compare IDs", () => {
  // Test with different timestamps
  const earlier = new TaskEventId("task_1650000000000_0");
  const later = new TaskEventId("task_1650000000001_0");

  assertEquals(later.isAfter(earlier), true);
  assertEquals(earlier.isAfter(later), false);

  // Test with same timestamp, different sequence
  const first = new TaskEventId("task_1650000000000_0");
  const second = new TaskEventId("task_1650000000000_1");

  assertEquals(second.isAfter(first), true);
  assertEquals(first.isAfter(second), false);

  // Test with same timestamp and sequence
  const sameTime1 = new TaskEventId("task_1650000000000_0");
  const sameTime2 = new TaskEventId("task_1650000000000_0");

  assertEquals(sameTime1.isAfter(sameTime2), false);
  assertEquals(sameTime2.isAfter(sameTime1), false);
});

Deno.test("TaskEventId - generateWithTimestamp should use provided timestamp", () => {
  const timestamp = 1650000000000;
  const id = TaskEventId.generateWithTimestamp(timestamp);

  assertEquals(id.timestamp, timestamp);
});

Deno.test("TaskEventId - sequential generation should increment sequence", () => {
  const timestamp = 1650000000000;

  // Mock Date.now to return a consistent timestamp
  const originalDateNow = Date.now;
  Date.now = () => timestamp;

  try {
    // First get the current sequence by generating an ID
    const initialId = TaskEventId.generate();
    const startingSequence = initialId.sequence;

    // Now generate IDs that should increment from that starting sequence
    const id2 = TaskEventId.generate();
    const id3 = TaskEventId.generate();

    assertEquals(initialId.timestamp, timestamp);
    assertEquals(id2.timestamp, timestamp);
    assertEquals(id3.timestamp, timestamp);

    // Verify they increment properly regardless of starting point
    assertEquals(id2.sequence, startingSequence + 1);
    assertEquals(id3.sequence, startingSequence + 2);
  } finally {
    // Restore original Date.now
    Date.now = originalDateNow;
  }
});

Deno.test("TaskEventId - reset sequence when timestamp changes", () => {
  // First generate with timestamp1 and get the sequence
  const timestamp1 = 1650000000000;
  const id1 = TaskEventId.generateWithTimestamp(timestamp1);
  const id2 = TaskEventId.generateWithTimestamp(timestamp1);

  // Verify sequence increased
  assertEquals(id2.sequence, id1.sequence + 1);

  // Now generate with a different timestamp
  const timestamp2 = 1650000000001;
  const newId = TaskEventId.generateWithTimestamp(timestamp2);

  // Sequence should be reset to 0
  assertEquals(newId.sequence, 0);
});

// Helper function to parse ID parts
function parseIdParts(id: string): [number, number] {
  const match = id.match(/^task_(\d+)_(\d+)$/);
  if (!match) {
    throw new Error(`Invalid ID format: ${id}`);
  }
  return [parseInt(match[1], 10), parseInt(match[2], 10)];
}

// Helper assert function
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}
