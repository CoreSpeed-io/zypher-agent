import { assertEquals } from "@std/assert";
import { Subject } from "rxjs";
import { withHeartbeat } from "../src/taskEvents.ts";

/**
 * Helper to create a heartbeat event for testing
 */
function createTestHeartbeat(): string {
  return "HEARTBEAT";
}

/**
 * Helper to wait for a specified time
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("withHeartbeat - should emit heartbeats during inactivity", async () => {
  // Set up a test source
  const source = new Subject<string>();
  const heartbeatInterval = 100; // Short interval for testing

  // Collect emitted events
  const emittedEvents: string[] = [];

  // Subscribe to the heartbeat-enabled observable
  const subscription = withHeartbeat(
    source,
    heartbeatInterval,
    createTestHeartbeat,
  )
    .subscribe((event) => {
      emittedEvents.push(event);
    });

  // Emit an initial event
  source.next("INITIAL");

  // Wait for slightly more than the heartbeat interval
  await wait(heartbeatInterval + 20);

  // Should have emitted a heartbeat
  assertEquals(emittedEvents.length, 2);
  assertEquals(emittedEvents[0], "INITIAL");
  assertEquals(emittedEvents[1], "HEARTBEAT");

  // Emit another event, which should reset the heartbeat timer
  source.next("SECOND");

  // Wait for slightly more than the heartbeat interval
  await wait(heartbeatInterval + 20);

  // Should have emitted a heartbeat after the second event
  assertEquals(emittedEvents.length, 4);
  assertEquals(emittedEvents[0], "INITIAL");
  assertEquals(emittedEvents[1], "HEARTBEAT");
  assertEquals(emittedEvents[2], "SECOND");
  assertEquals(emittedEvents[3], "HEARTBEAT");

  // Clean up
  subscription.unsubscribe();
});

Deno.test("withHeartbeat - should not emit heartbeats after source completes", async () => {
  // Set up a test source
  const source = new Subject<string>();
  const heartbeatInterval = 100; // Short interval for testing

  // Collect emitted events
  const emittedEvents: string[] = [];
  let completed = false;

  // Subscribe to the heartbeat-enabled observable
  const subscription = withHeartbeat(
    source,
    heartbeatInterval,
    createTestHeartbeat,
  )
    .subscribe({
      next: (event) => {
        emittedEvents.push(event);
      },
      complete: () => {
        completed = true;
      },
    });

  // Emit an event and then complete the source
  source.next("EVENT");
  source.complete();

  // Wait for slightly more than the heartbeat interval
  await wait(heartbeatInterval + 20);

  // Should not have emitted a heartbeat after completion
  assertEquals(emittedEvents.length, 1);
  assertEquals(emittedEvents[0], "EVENT");
  assertEquals(completed, true);

  // Clean up
  subscription.unsubscribe();
});

Deno.test("withHeartbeat - should not emit heartbeats after error", async () => {
  // Set up a test source
  const source = new Subject<string>();
  const heartbeatInterval = 100; // Short interval for testing

  // Collect emitted events
  const emittedEvents: string[] = [];
  let errorOccurred = false;

  // Subscribe to the heartbeat-enabled observable
  const subscription = withHeartbeat(
    source,
    heartbeatInterval,
    createTestHeartbeat,
  )
    .subscribe({
      next: (event) => {
        emittedEvents.push(event);
      },
      error: () => {
        errorOccurred = true;
      },
    });

  // Emit an event and then error the source
  source.next("EVENT");
  source.error(new Error("Test error"));

  // Wait for slightly more than the heartbeat interval
  await wait(heartbeatInterval + 20);

  // Should not have emitted a heartbeat after error
  assertEquals(emittedEvents.length, 1);
  assertEquals(emittedEvents[0], "EVENT");
  assertEquals(errorOccurred, true);

  // Clean up
  subscription.unsubscribe();
});

Deno.test("withHeartbeat - should support generic types", async () => {
  // Set up a test source with a custom type
  interface TestEvent {
    id: number;
    message: string;
  }

  const source = new Subject<TestEvent>();
  const heartbeatInterval = 100; // Short interval for testing

  // Heartbeat factory for the custom type
  const createCustomHeartbeat = (): TestEvent => ({
    id: -1, // Special ID for heartbeats
    message: "HEARTBEAT",
  });

  // Collect emitted events
  const emittedEvents: TestEvent[] = [];

  // Subscribe to the heartbeat-enabled observable
  const subscription = withHeartbeat(
    source,
    heartbeatInterval,
    createCustomHeartbeat,
  )
    .subscribe((event) => {
      emittedEvents.push(event);
    });

  // Emit an event
  const testEvent: TestEvent = { id: 1, message: "TEST" };
  source.next(testEvent);

  // Wait for slightly more than the heartbeat interval
  await wait(heartbeatInterval + 20);

  // Should have emitted the test event and a heartbeat
  assertEquals(emittedEvents.length, 2);
  assertEquals(emittedEvents[0], testEvent);
  assertEquals(emittedEvents[1].id, -1);
  assertEquals(emittedEvents[1].message, "HEARTBEAT");

  // Clean up
  subscription.unsubscribe();
});

Deno.test("withHeartbeat - should not emit heartbeats during continuous activity", async () => {
  // Set up a test source
  const source = new Subject<string>();
  const heartbeatInterval = 100; // Short interval for testing

  // Collect emitted events
  const emittedEvents: string[] = [];

  // Subscribe to the heartbeat-enabled observable
  const subscription = withHeartbeat(
    source,
    heartbeatInterval,
    createTestHeartbeat,
  )
    .subscribe((event) => {
      emittedEvents.push(event);
    });

  // Emit events frequently (more often than the heartbeat interval)
  source.next("EVENT1");

  // Wait for less than the heartbeat interval
  await wait(heartbeatInterval / 2);

  // Emit another event before the heartbeat interval expires
  source.next("EVENT2");

  // Wait for less than the heartbeat interval
  await wait(heartbeatInterval / 2);

  // Emit another event before the heartbeat interval expires
  source.next("EVENT3");

  // Wait for less than the heartbeat interval
  await wait(heartbeatInterval / 2);

  // Should not have emitted any heartbeats, only the source events
  assertEquals(emittedEvents.length, 3);
  assertEquals(emittedEvents[0], "EVENT1");
  assertEquals(emittedEvents[1], "EVENT2");
  assertEquals(emittedEvents[2], "EVENT3");

  // No heartbeats should be present
  assertEquals(emittedEvents.includes("HEARTBEAT"), false);

  // Clean up
  subscription.unsubscribe();
});
