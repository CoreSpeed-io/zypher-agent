import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { ApiError } from "../../bin/api-server.ts";

// Create a minimal version of the API server for testing
function createTestApp() {
  const app = new Hono();

  // Create mock agent state
  const isTaskRunning = { value: false };
  const cancelTask = spy((_reason: "user" | "timeout") => {
    if (isTaskRunning.value) {
      isTaskRunning.value = false;
      return true;
    }
    return false;
  });

  const agent = {
    get isTaskRunning() {
      return isTaskRunning.value;
    },
    set isTaskRunning(val: boolean) {
      isTaskRunning.value = val;
    },
    cancelTask,
  };

  // Error handler
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      c.status(err.statusCode as StatusCode);
      return c.json({
        code: err.statusCode,
        type: err.type,
        message: err.message,
        details: err.details,
      });
    }

    c.status(500);
    return c.json({
      code: 500,
      type: "internal_server_error",
      message: "Internal server error",
    });
  });

  // Cancel endpoint
  app.get("/agent/task/cancel", (c) => {
    if (!agent.isTaskRunning) {
      throw new ApiError(
        404,
        "task_not_running",
        "No task was running to cancel",
      );
    }

    agent.cancelTask("user");

    return c.json({
      success: true,
      message: "Task cancelled successfully",
      status: "idle",
    });
  });

  return { app, agent };
}

// Isolated test for API with proper resource cleanup
Deno.test("API Task Cancellation - should return 404 when no task is running", async () => {
  // Create a fresh environment for each test
  const { app, agent } = createTestApp();
  agent.isTaskRunning = false;

  // Use AbortController to manage request lifecycle
  const controller = new AbortController();
  const signal = controller.signal;

  try {
    // Send request with controlled signal
    const req = new Request("http://localhost/agent/task/cancel", {
      method: "GET",
      signal,
    });

    // Process the request and get response
    const res = await app.fetch(req);
    assertEquals(res.status, 404);

    // Get and validate the response body
    const body = await res.json();
    assertEquals(body.type, "task_not_running");
    assertEquals(body.message, "No task was running to cancel");
  } finally {
    // Clean up any pending operations
    controller.abort();
  }
});

Deno.test("API Task Cancellation - should cancel a running task successfully", async () => {
  // Create a fresh environment for each test
  const { app, agent } = createTestApp();
  agent.isTaskRunning = true;

  // Use AbortController to manage request lifecycle
  const controller = new AbortController();
  const signal = controller.signal;

  try {
    // Send request with controlled signal
    const req = new Request("http://localhost/agent/task/cancel", {
      method: "GET",
      signal,
    });

    // Process the request and get response
    const res = await app.fetch(req);
    assertEquals(res.status, 200);

    // Get and validate the response body
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.message, "Task cancelled successfully");
    assertEquals(body.status, "idle");

    // Verify the agent state
    assertEquals(agent.isTaskRunning, false);
  } finally {
    // Clean up any pending operations
    controller.abort();
  }
});
