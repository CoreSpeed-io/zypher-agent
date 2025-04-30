import { assertEquals } from "@std/assert";
import { Observable, ReplaySubject } from "rxjs";
import {
  ContentDeltaEventData,
  replayEvents,
  TaskEvent,
  TaskEventId,
  ToolApprovalPendingEventData,
} from "../src/taskEvents.ts";

// Helper function to create a content delta event
function createContentEvent(
  eventId: string,
  content: string,
): TaskEvent {
  return {
    event: "content_delta",
    data: {
      eventId,
      content,
    } as ContentDeltaEventData,
  };
}

// Helper function to create a tool approval pending event
function createToolApprovalEvent(
  eventId: string,
  toolName: string,
  args: unknown,
): TaskEvent {
  return {
    event: "tool_approval_pending",
    data: {
      eventId,
      toolName,
      args,
    } as ToolApprovalPendingEventData,
  };
}

// Helper function to collect events from an observable into an array
function collectEvents(
  observable: Observable<TaskEvent>,
): Promise<TaskEvent[]> {
  const events: TaskEvent[] = [];

  return new Promise<TaskEvent[]>((resolve) => {
    // First collect all events
    observable.subscribe({
      next: (event) => events.push(event),
      error: (err) => console.error("Error in observable:", err),
      complete: () => resolve(events),
    });
  });
}

Deno.test("replayEvents - should filter events based on clientLastEventId", async () => {
  // Create a replay subject with some events
  const subject = new ReplaySubject<TaskEvent>();

  // Generate event IDs with increasing timestamps
  const id1 = new TaskEventId("task_1000_0");
  const id2 = new TaskEventId("task_2000_0");
  const id3 = new TaskEventId("task_3000_0");

  // Add events to the subject
  subject.next(createContentEvent(id1.toString(), "Event 1"));
  subject.next(createContentEvent(id2.toString(), "Event 2"));
  subject.next(createContentEvent(id3.toString(), "Event 3"));
  subject.complete();

  // Test with no clientLastEventId - should return all events
  const allEvents = await collectEvents(
    replayEvents(subject, id3, undefined),
  );
  assertEquals(allEvents.length, 3);

  // Test with clientLastEventId = id1 - should return events after id1
  const eventsAfterId1 = await collectEvents(
    replayEvents(subject, id3, id1),
  );
  assertEquals(eventsAfterId1.length, 2);
  assertEquals(
    (eventsAfterId1[0].data as ContentDeltaEventData).content,
    "Event 2",
  );
  assertEquals(
    (eventsAfterId1[1].data as ContentDeltaEventData).content,
    "Event 3",
  );

  // Test with clientLastEventId = id2 - should return events after id2
  const eventsAfterId2 = await collectEvents(
    replayEvents(subject, id3, id2),
  );
  assertEquals(eventsAfterId2.length, 1);
  assertEquals(
    (eventsAfterId2[0].data as ContentDeltaEventData).content,
    "Event 3",
  );
});

Deno.test("replayEvents - should filter out stale pending approval events", async () => {
  // Create a replay subject with some events
  const subject = new ReplaySubject<TaskEvent>();

  // Generate event IDs with increasing timestamps
  const id1 = new TaskEventId("task_1000_0"); // Old event
  const id2 = new TaskEventId("task_2000_0"); // Server's latest event
  const id3 = new TaskEventId("task_3000_0"); // New event (after server's latest)

  // Add regular events and tool approval events to the subject
  subject.next(createContentEvent(id1.toString(), "Regular Event 1"));
  subject.next(
    createToolApprovalEvent(id1.toString(), "test_tool", { arg1: "value1" }),
  );
  subject.next(createContentEvent(id2.toString(), "Regular Event 2"));
  subject.next(
    createToolApprovalEvent(id2.toString(), "test_tool", { arg1: "value2" }),
  );
  subject.next(createContentEvent(id3.toString(), "Regular Event 3"));
  subject.next(
    createToolApprovalEvent(id3.toString(), "test_tool", { arg1: "value3" }),
  );
  subject.complete();

  // Test filtering with serverLatestEventId = id2
  // Should include all regular events but only tool approval events >= id2
  const filteredEvents = await collectEvents(
    replayEvents(subject, id2, undefined),
  );

  // Should have 5 events: 3 regular events + 2 non-stale tool approval events
  assertEquals(filteredEvents.length, 5);

  // Count the number of tool approval events (should be 2)
  const toolApprovalEvents = filteredEvents.filter((e) =>
    e.event === "tool_approval_pending"
  );
  assertEquals(toolApprovalEvents.length, 2);

  // Verify that the stale tool approval event (id1) is filtered out
  const staleEventExists = toolApprovalEvents.some((e) =>
    e.data.eventId === id1.toString()
  );
  assertEquals(staleEventExists, false);

  // Verify that the non-stale tool approval events (id2 and id3) are included
  const id2EventExists = toolApprovalEvents.some((e) =>
    e.data.eventId === id2.toString()
  );
  const id3EventExists = toolApprovalEvents.some((e) =>
    e.data.eventId === id3.toString()
  );
  assertEquals(id2EventExists, true);
  assertEquals(id3EventExists, true);
});

Deno.test("replayEvents - should handle both filters together", async () => {
  // Create a replay subject with some events
  const subject = new ReplaySubject<TaskEvent>();

  // Generate event IDs with increasing timestamps
  const id1 = new TaskEventId("task_1000_0"); // Old event
  const id2 = new TaskEventId("task_2000_0"); // Client's last event
  const id3 = new TaskEventId("task_3000_0"); // Server's latest event
  const id4 = new TaskEventId("task_4000_0"); // New event (after server's latest)

  // Add events to the subject
  subject.next(createContentEvent(id1.toString(), "Event 1"));
  subject.next(
    createToolApprovalEvent(id1.toString(), "test_tool", { arg1: "value1" }),
  );
  subject.next(createContentEvent(id2.toString(), "Event 2"));
  subject.next(
    createToolApprovalEvent(id2.toString(), "test_tool", { arg1: "value2" }),
  );
  subject.next(createContentEvent(id3.toString(), "Event 3"));
  subject.next(
    createToolApprovalEvent(id3.toString(), "test_tool", { arg1: "value3" }),
  );
  subject.next(createContentEvent(id4.toString(), "Event 4"));
  subject.next(
    createToolApprovalEvent(id4.toString(), "test_tool", { arg1: "value4" }),
  );
  subject.complete();

  // Test with both filters:
  // - clientLastEventId = id2 (only events after id2)
  // - serverLatestEventId = id3 (only tool approval events >= id3)
  const filteredEvents = await collectEvents(
    replayEvents(subject, id3, id2),
  );

  // Should have 4 events: 2 regular events (after id2) + 2 non-stale tool approval events (id3 and id4)
  // Note: id3's tool approval event is included because it's equal to serverLatestEventId
  assertEquals(filteredEvents.length, 4);

  // Count the number of tool approval events (should be 2)
  const toolApprovalEvents = filteredEvents.filter((e) =>
    e.event === "tool_approval_pending"
  );
  assertEquals(toolApprovalEvents.length, 2);

  // Verify that only id3 and id4's content_delta events are included
  const contentEvents = filteredEvents.filter((e) =>
    e.event === "content_delta"
  );
  assertEquals(contentEvents.length, 2);
  assertEquals(
    (contentEvents[0].data as ContentDeltaEventData).content,
    "Event 3",
  );
  assertEquals(
    (contentEvents[1].data as ContentDeltaEventData).content,
    "Event 4",
  );

  // Verify that both id3 and id4's tool approval events are included
  const eventIds = toolApprovalEvents.map((e) => e.data.eventId);
  assertEquals(eventIds.includes(id3.toString()), true);
  assertEquals(eventIds.includes(id4.toString()), true);
});
