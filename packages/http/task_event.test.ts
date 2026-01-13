import { assertEquals, assertThrows } from "@std/assert";
import { HttpTaskEventId } from "./task_event.ts";

Deno.test("HttpTaskEventId - constructor should parse valid ID format", () => {
  const timestamp = 1650000000000;
  const sequence = 5;
  const id = HttpTaskEventId.parse(`task_${timestamp}_${sequence}`);

  assertEquals(id.timestamp, timestamp);
  assertEquals(id.sequence, sequence);
  assertEquals(id.toString(), `task_${timestamp}_${sequence}`);
});

Deno.test("HttpTaskEventId - constructor should throw on invalid format", () => {
  // Invalid prefix
  assertThrows(
    () => HttpTaskEventId.parse("invalid_1650000000000_5"),
    Error,
    "Invalid event ID format",
  );

  // Missing sequence
  assertThrows(
    () => HttpTaskEventId.parse("task_1650000000000"),
    Error,
    "Invalid event ID format",
  );

  // Non-numeric timestamp
  assertThrows(
    () => HttpTaskEventId.parse("task_timestamp_5"),
    Error,
    "Invalid event ID format",
  );

  // Non-numeric sequence
  assertThrows(
    () => HttpTaskEventId.parse("task_1650000000000_sequence"),
    Error,
    "Invalid event ID format",
  );
});

Deno.test("HttpTaskEventId - generate should create unique IDs", () => {
  const id1 = HttpTaskEventId.generate();
  const id2 = HttpTaskEventId.generate();

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

Deno.test("HttpTaskEventId - isAfter should correctly compare IDs", () => {
  // Test with different timestamps
  const earlier = HttpTaskEventId.parse("task_1650000000000_0");
  const later = HttpTaskEventId.parse("task_1650000000001_0");

  assertEquals(later.isAfter(earlier), true);
  assertEquals(earlier.isAfter(later), false);

  // Test with same timestamp, different sequence
  const first = HttpTaskEventId.parse("task_1650000000000_0");
  const second = HttpTaskEventId.parse("task_1650000000000_1");

  assertEquals(second.isAfter(first), true);
  assertEquals(first.isAfter(second), false);

  // Test with same timestamp and sequence
  const sameTime1 = HttpTaskEventId.parse("task_1650000000000_0");
  const sameTime2 = HttpTaskEventId.parse("task_1650000000000_0");

  assertEquals(sameTime1.isAfter(sameTime2), false);
  assertEquals(sameTime2.isAfter(sameTime1), false);

  // Test with higher sequence but lower timestamp
  // Timestamp should take precedence over sequence
  const olderHigherSequence = HttpTaskEventId.parse("task_1650000000000_5");
  const newerLowerSequence = HttpTaskEventId.parse("task_1650000000001_0");

  assertEquals(olderHigherSequence.isAfter(newerLowerSequence), false);
  assertEquals(newerLowerSequence.isAfter(olderHigherSequence), true);
});

Deno.test("HttpTaskEventId - generateWithTimestamp should use provided timestamp", () => {
  const timestamp = 1650000000000;
  const id = HttpTaskEventId.generateWithTimestamp(timestamp);

  assertEquals(id.timestamp, timestamp);
});

Deno.test("HttpTaskEventId - sequential generation should increment sequence", () => {
  const timestamp = 1650000000000;

  // Mock Date.now to return a consistent timestamp
  const originalDateNow = Date.now;
  Date.now = () => timestamp;

  try {
    // First get the current sequence by generating an ID
    const initialId = HttpTaskEventId.generate();
    const startingSequence = initialId.sequence;

    // Now generate IDs that should increment from that starting sequence
    const id2 = HttpTaskEventId.generate();
    const id3 = HttpTaskEventId.generate();

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

Deno.test("HttpTaskEventId - reset sequence when timestamp changes", () => {
  // First generate with timestamp1 and get the sequence
  const timestamp1 = 1650000000000;
  const id1 = HttpTaskEventId.generateWithTimestamp(timestamp1);
  const id2 = HttpTaskEventId.generateWithTimestamp(timestamp1);

  // Verify sequence increased
  assertEquals(id2.sequence, id1.sequence + 1);

  // Now generate with a different timestamp
  const timestamp2 = 1650000000001;
  const newId = HttpTaskEventId.generateWithTimestamp(timestamp2);

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
