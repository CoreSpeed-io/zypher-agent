import { assertEquals } from "@std/assert";
import { assertSpyCall, assertSpyCalls, spy } from "jsr:@std/testing/mock";

// Test utility class for agent state
class TestAgent {
  isTaskRunning = false;
  cancellationReason: "user" | "timeout" | null = null;
  private _timeoutId: ReturnType<typeof setTimeout> | null = null;

  cleanup(): void {
    if (this._timeoutId !== null) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }

  cancelTask(reason: "user" | "timeout" = "user") {
    if (this.isTaskRunning) {
      this.isTaskRunning = false;
      this.cancellationReason = reason;
      this.cleanup();
      return true;
    }
    return false;
  }
}

// Mock stream handler creator
function createStreamHandler(
  onCancelled: (reason: "user" | "timeout") => void,
) {
  return {
    onCancelled,
  };
}

Deno.test("Stream Cancellation - should handle task cancellation", () => {
  const agent = new TestAgent();

  try {
    // Start task
    agent.isTaskRunning = true;

    // Cancel the task
    agent.cancelTask("user");

    // Verify state
    assertEquals(agent.isTaskRunning, false);
    assertEquals(agent.cancellationReason, "user");
  } finally {
    agent.cleanup();
  }
});

Deno.test("Stream Cancellation - should handle WebSocket closure", () => {
  const agent = new TestAgent();

  try {
    // Start a task
    agent.isTaskRunning = true;

    // Simulate WebSocket closure
    const onClose = () => {
      if (agent.isTaskRunning) {
        agent.cancelTask("user");
      }
    };

    // Call onClose
    onClose();

    // Verify the task was cancelled
    assertEquals(agent.isTaskRunning, false);
    assertEquals(agent.cancellationReason, "user");
  } finally {
    agent.cleanup();
  }
});

Deno.test("Stream Cancellation - should handle SSE connection abort", () => {
  const agent = new TestAgent();

  try {
    // Start a task
    agent.isTaskRunning = true;

    // Simulate SSE connection abort
    const abortHandler = () => {
      if (agent.isTaskRunning) {
        agent.cancelTask("user");
      }
    };

    // Call abort handler
    abortHandler();

    // Verify the task was cancelled
    assertEquals(agent.isTaskRunning, false);
    assertEquals(agent.cancellationReason, "user");
  } finally {
    agent.cleanup();
  }
});

Deno.test("Stream Cancellation - should handle timeout cancellation", () => {
  const agent = new TestAgent();
  const onCancelled = spy(() => {});

  try {
    // Start task
    agent.isTaskRunning = true;

    // Simulate timeout cancellation
    agent.cancelTask("timeout");

    // Create stream handler and notify about cancellation
    const streamHandler = createStreamHandler(onCancelled);

    // Simulate calling onCancelled
    if (agent.cancellationReason && streamHandler.onCancelled) {
      streamHandler.onCancelled(agent.cancellationReason);
    }

    // Verify the handler was called with timeout
    assertSpyCalls(onCancelled, 1);
    assertSpyCall(onCancelled, 0, {
      args: ["timeout"],
    });
    assertEquals(agent.isTaskRunning, false);
    assertEquals(agent.cancellationReason, "timeout");
  } finally {
    agent.cleanup();
  }
});
