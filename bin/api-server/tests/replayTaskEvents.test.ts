import { assertEquals } from "@std/assert";
import { Observable, ReplaySubject } from "rxjs";
import {
  ContentDeltaEventData,
  replayTaskEvents,
  TaskEvent,
  TaskEventId,
  ToolApprovalPendingEventData,
} from "../src/taskEvents.ts";

// Helper function to create a content delta event
function createContentEvent(
  eventId: TaskEventId,
  content: string,
): TaskEvent {
  return {
    event: "content_delta",
    data: {
      eventId: eventId.toString(),
      content,
    } as ContentDeltaEventData,
  };
}

// Helper function to create a tool approval pending event
function createToolApprovalEvent(
  eventId: TaskEventId,
  toolName: string,
  args: unknown,
): TaskEvent {
  return {
    event: "tool_approval_pending",
    data: {
      eventId: eventId.toString(),
      toolName,
      args,
    } as ToolApprovalPendingEventData,
  };
}

// Helper function to create a standard set of test events
function createTestEvents() {
  const subject = new ReplaySubject<TaskEvent>();
  
  // Generate event IDs with increasing timestamps
  const id1 = new TaskEventId("task_1000_0"); // Oldest content event
  const id2 = new TaskEventId("task_1500_0"); // Oldest tool approval event
  const id3 = new TaskEventId("task_2000_0"); // Middle content event
  const id4 = new TaskEventId("task_2500_0"); // Middle tool approval event
  const id5 = new TaskEventId("task_3000_0"); // Newest content event
  const id6 = new TaskEventId("task_3500_0"); // Newest tool approval event
  
  // Add a mix of different event types to the subject
  subject.next(createContentEvent(id1, "Content Event 1"));
  subject.next(createToolApprovalEvent(id2, "tool1", { param: "value1" }));
  subject.next(createContentEvent(id3, "Content Event 2"));
  subject.next(createToolApprovalEvent(id4, "tool2", { param: "value2" }));
  subject.next(createContentEvent(id5, "Content Event 3"));
  subject.next(createToolApprovalEvent(id6, "tool3", { param: "value3" }));
  subject.complete();
  
  return { subject, id1, id2, id3, id4, id5, id6 };
}

// Helper function to collect events from an observable into an array
function collectEvents(
  observable: Observable<TaskEvent>,
): Promise<TaskEvent[]> {
  const events: TaskEvent[] = [];

  return new Promise<TaskEvent[]>((resolve) => {
    observable.subscribe({
      next: (event) => events.push(event),
      error: (err) => console.error("Error in observable:", err),
      complete: () => resolve(events),
    });
  });
}

/**
 * Test Case 1: When nothing provided
 * Expected: All events should be returned without filtering
 */
Deno.test("replayTaskEvents - should replay all events when neither parameter is provided", async () => {
  const { subject, id1, id2, id3, id4, id5, id6 } = createTestEvents();

  // Test with neither parameter provided (both undefined)
  const allEvents = await collectEvents(
    replayTaskEvents(subject, undefined, undefined),
  );

  // Verify all events are included (6 total: 3 content + 3 tool approval)
  assertEquals(allEvents.length, 6);

  // Verify all content events are included
  const contentEvents = allEvents.filter(e => e.event === "content_delta");
  assertEquals(contentEvents.length, 3);
  
  // Verify all tool approval events are included
  const toolEvents = allEvents.filter(e => e.event === "tool_approval_pending");
  assertEquals(toolEvents.length, 3);
  
  // Verify events from all IDs are present
  const eventIds = allEvents.map(e => e.data.eventId);
  assertEquals(eventIds.includes(id1.toString()), true);
  assertEquals(eventIds.includes(id2.toString()), true);
  assertEquals(eventIds.includes(id3.toString()), true);
  assertEquals(eventIds.includes(id4.toString()), true);
  assertEquals(eventIds.includes(id5.toString()), true);
  assertEquals(eventIds.includes(id6.toString()), true);
});

/**
 * Test Case 2: When only serverLatestEvent provided
 * Expected: All content events should be included, but only non-stale tool approval events
 */
Deno.test("replayTaskEvents - should filter stale tool approval events when only serverLatestEventId is provided", async () => {
  const { subject, id1: _id1, id2, id3: _id3, id4, id5: _id5, id6 } = createTestEvents();

  // Test with only serverLatestEventId = id4 (middle tool approval event)
  const filteredEvents = await collectEvents(
    replayTaskEvents(subject, id4, undefined),
  );

  // Should have 5 events: 3 content events + 2 non-stale tool approval events (id4 and id6)
  assertEquals(filteredEvents.length, 5);

  // Verify all content events are included
  const contentEvents = filteredEvents.filter(e => e.event === "content_delta");
  assertEquals(contentEvents.length, 3);
  
  // Verify only non-stale tool approval events are included
  const toolEvents = filteredEvents.filter(e => e.event === "tool_approval_pending");
  assertEquals(toolEvents.length, 2);
  
  // Verify stale tool approval event (id2) is filtered out
  const toolEventIds = toolEvents.map(e => e.data.eventId);
  assertEquals(toolEventIds.includes(id2.toString()), false);
  assertEquals(toolEventIds.includes(id4.toString()), true);
  assertEquals(toolEventIds.includes(id6.toString()), true);
});

/**
 * Test Case 3: When only lastClientEventId provided
 * Expected: Only events after lastClientEventId should be included
 */
Deno.test("replayTaskEvents - should filter events based on clientLastEventId only when serverLatestEventId is not provided", async () => {
  const { subject, id1, id2, id3, id4, id5, id6 } = createTestEvents();

  // Test with only clientLastEventId = id1 (oldest content event)
  const filteredEvents = await collectEvents(
    replayTaskEvents(subject, undefined, id1),
  );

  // Should have 5 events: all events after id1
  assertEquals(filteredEvents.length, 5);

  // Verify that only events after id1 are included
  const eventIds = filteredEvents.map(e => e.data.eventId);
  assertEquals(eventIds.includes(id1.toString()), false);
  assertEquals(eventIds.includes(id2.toString()), true);
  assertEquals(eventIds.includes(id3.toString()), true);
  assertEquals(eventIds.includes(id4.toString()), true);
  assertEquals(eventIds.includes(id5.toString()), true);
  assertEquals(eventIds.includes(id6.toString()), true);
  
  // Verify content of events
  const contentEvents = filteredEvents.filter(e => e.event === "content_delta");
  assertEquals(contentEvents.length, 2);
  assertEquals(
    (contentEvents[0].data as ContentDeltaEventData).content,
    "Content Event 2",
  );
  assertEquals(
    (contentEvents[1].data as ContentDeltaEventData).content,
    "Content Event 3",
  );
});

/**
 * Test Case 4: When both provided
 * Expected: Only events after lastClientEventId should be included,
 * and only non-stale tool approval events (>= serverLatestEventId)
 */
Deno.test("replayTaskEvents - should handle both filters together correctly", async () => {
  const { subject, id1: _id1, id2: _id2, id3, id4, id5: _id5, id6 } = createTestEvents();

  // Test with both filters:
  // - clientLastEventId = id3 (only events after id3)
  // - serverLatestEventId = id4 (only tool approval events >= id4)
  const filteredEvents = await collectEvents(
    replayTaskEvents(subject, id4, id3),
  );

  // Should have 3 events: 1 approval event (id4) + 1 content event (id5) + 1 tool approval event (id6)
  // Events before id3 are filtered out by clientLastEventId
  // Tool approval events before id4 are filtered out by serverLatestEventId
  assertEquals(filteredEvents.length, 3);

  // Verify content events - only id5 should be included (after id3)
  const contentEvents = filteredEvents.filter(e => e.event === "content_delta");
  assertEquals(contentEvents.length, 1);
  assertEquals(
    (contentEvents[0].data as ContentDeltaEventData).content,
    "Content Event 3",
  );

  // Verify tool approval events - id4 and id6 should be included (after id4)
  const toolEvents = filteredEvents.filter(e => e.event === "tool_approval_pending");
  assertEquals(toolEvents.length, 2);

  const toolEventIds = toolEvents.map(e => e.data.eventId);
  assertEquals(toolEventIds.includes(id4.toString()), true);
  assertEquals(toolEventIds.includes(id6.toString()), true);
});
