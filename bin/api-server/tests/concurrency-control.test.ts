import { assertEquals } from "@std/assert";
import { delay } from "@std/async";

// Mock StreamHandler type
type MockStreamHandler = {
  onContent?: (content: string, isFirstChunk: boolean) => void;
  onToolUse?: (name: string, partialInput: Record<string, unknown>) => void;
  onMessage?: (message: unknown) => void;
  onCancelled?: (reason: "user" | "timeout") => void;
};

// Mock ZypherAgent
class MockZypherAgent {
  private _isTaskRunning = false;
  private _cancellationReason: "user" | "timeout" | null = null;
  private _currentStreamHandler: MockStreamHandler | undefined;
  public mockDelay = 15000; // Simulate a 15-second API call, changed to public for test modification
  public taskTimeoutMs = 60000;

  constructor() {}

  // Implement the same interface as ZypherAgent
  get isTaskRunning(): boolean {
    return this._isTaskRunning;
  }

  get cancellationReason(): "user" | "timeout" | null {
    return this._cancellationReason;
  }

  // Check and set task running state
  checkAndSetTaskRunning(): boolean {
    if (this._isTaskRunning) {
      return false;
    }
    this._isTaskRunning = true;
    return true;
  }

  // Clear task running state
  clearTaskRunning(): void {
    this._isTaskRunning = false;
  }

  // Get messages
  getMessages(): unknown[] {
    return [];
  }

  // Clear messages
  clearMessages(): void {
    // No operation
  }

  // Cancel task
  cancelTask(reason: "user" | "timeout" = "user"): boolean {
    if (!this._isTaskRunning) {
      return false;
    }

    this._isTaskRunning = false;
    this._cancellationReason = reason;

    if (this._currentStreamHandler?.onCancelled) {
      this._currentStreamHandler.onCancelled(reason);
    }

    return true;
  }

  // Mock run task, delays 15 seconds before completion
  async runTaskWithStreaming(
    task: string,
    streamHandler: MockStreamHandler,
    _imageAttachments: unknown[] = [],
  ): Promise<unknown[]> {
    if (!this._isTaskRunning) {
      throw new Error("Task was not properly initiated");
    }

    this._currentStreamHandler = streamHandler;

    try {
      // Simulate content streaming
      if (streamHandler.onContent) {
        streamHandler.onContent(`Starting task: ${task}`, true);
        await delay(100);
        streamHandler.onContent(" Processing...", false);
      }

      // Wait 15 seconds to simulate a long-running API call
      const startTime = Date.now();
      while (Date.now() - startTime < this.mockDelay && this._isTaskRunning) {
        // Send some content every second to simulate continuous output
        if (streamHandler.onContent && this._isTaskRunning) {
          streamHandler.onContent(`.`, false);
        }
        await delay(1000);
      }

      // If task was cancelled, return empty array
      if (!this._isTaskRunning) {
        return [];
      }

      // Completion message
      if (streamHandler.onMessage) {
        streamHandler.onMessage({
          role: "assistant",
          content: `Task completed: ${task}`,
        });
      }

      // Task completed, clear state
      this._isTaskRunning = false;
      return [{ role: "assistant", content: `Task completed: ${task}` }];
    } catch (error) {
      this._isTaskRunning = false;
      throw error;
    }
  }

  // Apply checkpoint (empty implementation)
  async applyCheckpoint(_checkpointId: string): Promise<void> {
    // No operation
  }
}

// Directly mock SSE client, interacting directly with MockZypherAgent
class MockSSEClient {
  private events: Array<{
    eventType: string;
    data: string;
  }> = [];
  private status: number = 0;
  private taskRunning = false;
  private aborted = false;
  private taskCompletePromise: Promise<void> | null = null;
  private taskCompleteResolver: (() => void) | null = null;

  constructor(
    private readonly agent: MockZypherAgent,
    private readonly taskInfo: { task: string },
  ) {
    // Initialize completion Promise
    this.taskCompletePromise = new Promise<void>((resolve) => {
      this.taskCompleteResolver = resolve;
    });
  }

  // Simulate SSE connection
  connect(): number {
    try {
      console.log(`Simulating SSE request: ${JSON.stringify(this.taskInfo)}`);

      // Directly call agent's checkAndSetTaskRunning method for concurrency control
      if (!this.agent.checkAndSetTaskRunning()) {
        this.status = 409; // Conflict status
        console.log(`SSE request rejected: A task is already running`);
        // If request is rejected, immediately resolve the completion Promise
        if (this.taskCompleteResolver) {
          this.taskCompleteResolver();
        }
        return this.status;
      }

      this.status = 200; // Success status
      this.taskRunning = true;
      console.log(`SSE request successful, starting task`);

      // Create event handler
      const streamHandler: MockStreamHandler = {
        onContent: (content, _isFirstChunk) => {
          if (this.aborted) return;

          this.events.push({
            eventType: "content_delta",
            data: JSON.stringify({ content }),
          });
          console.log(
            `Received content: ${content.substring(0, 50)}${
              content.length > 50 ? "..." : ""
            }`,
          );
        },
        onMessage: (message) => {
          if (this.aborted) return;

          this.events.push({
            eventType: "message",
            data: JSON.stringify(message),
          });
          console.log(`Received message`);
        },
        onToolUse: (name, partialInput) => {
          if (this.aborted) return;

          this.events.push({
            eventType: "tool_use_delta",
            data: JSON.stringify({ name, partialInput }),
          });
          console.log(`Received tool usage: ${name}`);
        },
        onCancelled: (reason) => {
          if (this.aborted) return;

          this.events.push({
            eventType: "cancelled",
            data: JSON.stringify({ reason }),
          });
          console.log(`Task cancelled, reason: ${reason}`);
          this.taskRunning = false;

          // When task is cancelled, resolve the Promise
          if (this.taskCompleteResolver) {
            this.taskCompleteResolver();
          }
        },
      };

      // Run task asynchronously
      this.runTask(streamHandler).catch((err) => {
        console.error("Error running SSE task:", err);
        // Resolve Promise on error
        if (this.taskCompleteResolver) {
          this.taskCompleteResolver();
        }
      });

      return this.status;
    } catch (error) {
      console.error("Error simulating SSE request:", error);
      // Resolve Promise on error
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
      return 500;
    }
  }

  // Run task asynchronously
  private async runTask(streamHandler: MockStreamHandler): Promise<void> {
    try {
      // Directly call agent's runTaskWithStreaming method
      const _messages = await this.agent.runTaskWithStreaming(
        this.taskInfo.task,
        streamHandler,
        [],
      );

      // Task completed, add completion event
      if (!this.aborted) {
        this.events.push({
          eventType: "complete",
          data: JSON.stringify({}),
        });
        console.log(`Task completed`);
      }

      this.taskRunning = false;

      // When task completes, resolve the Promise
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
    } catch (error) {
      console.error("Error executing task:", error);

      if (!this.aborted) {
        this.events.push({
          eventType: "error",
          data: JSON.stringify({ error: String(error) }),
        });
      }

      this.taskRunning = false;

      // Resolve Promise on error
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
    }
  }

  // Wait for task completion
  waitForCompletion(): Promise<void> {
    return this.taskCompletePromise || Promise.resolve();
  }

  // Close connection
  close(): void {
    console.log("Closing SSE connection");

    if (this.taskRunning) {
      this.aborted = true;
      this.agent.cancelTask("user");
    }
  }

  // Get received events
  getEvents(): Array<{ eventType: string; data: string }> {
    return this.events;
  }

  // Get connection status code
  getStatus(): number {
    return this.status;
  }
}

// Directly mock WebSocket client, interacting directly with MockZypherAgent
class MockWebSocketClient {
  private status: number = 0;
  private error?: { code?: number; type?: string; message?: string };
  private taskRunning = false;
  private aborted = false;
  private events: Array<{
    eventType: string;
    data: string;
  }> = [];
  private taskCompletePromise: Promise<void> | null = null;
  private taskCompleteResolver: (() => void) | null = null;

  constructor(private readonly agent: MockZypherAgent) {
    // Initialize completion Promise
    this.taskCompletePromise = new Promise<void>((resolve) => {
      this.taskCompleteResolver = resolve;
    });
  }

  // Simulate WebSocket connection
  async connect(taskInfo: { task: string }): Promise<void> {
    console.log(`Simulating WebSocket connection: ${JSON.stringify(taskInfo)}`);

    // Simulate connection delay
    await delay(10);

    // Directly call agent's checkAndSetTaskRunning method
    if (!this.agent.checkAndSetTaskRunning()) {
      this.status = 409;
      this.error = {
        code: 409,
        type: "task_in_progress",
        message: "A task is already running",
      };
      console.log(`WebSocket connection failed: ${this.error.message}`);

      // If request is rejected, immediately resolve the completion Promise
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
      return;
    }

    this.status = 200;
    this.taskRunning = true;
    console.log(`WebSocket connection successful, task started`);

    // Create event handler
    const streamHandler: MockStreamHandler = {
      onContent: (content, _isFirstChunk) => {
        if (this.aborted) return;

        this.events.push({
          eventType: "content_delta",
          data: JSON.stringify({ content }),
        });
      },
      onMessage: (message) => {
        if (this.aborted) return;

        this.events.push({
          eventType: "message",
          data: JSON.stringify(message),
        });
      },
      onToolUse: (name, partialInput) => {
        if (this.aborted) return;

        this.events.push({
          eventType: "tool_use_delta",
          data: JSON.stringify({ name, partialInput }),
        });
      },
      onCancelled: (reason) => {
        if (this.aborted) return;

        this.events.push({
          eventType: "cancelled",
          data: JSON.stringify({ reason }),
        });
        this.taskRunning = false;

        // When task is cancelled, resolve the Promise
        if (this.taskCompleteResolver) {
          this.taskCompleteResolver();
        }
      },
    };

    // Run task asynchronously
    this.runTask(taskInfo.task, streamHandler).catch((err) => {
      console.error("Error running WebSocket task:", err);
      // Resolve Promise on error
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
    });
  }

  // Run task asynchronously
  private async runTask(
    task: string,
    streamHandler: MockStreamHandler,
  ): Promise<void> {
    try {
      // Directly call agent's runTaskWithStreaming method
      const _messages = await this.agent.runTaskWithStreaming(
        task,
        streamHandler,
        [],
      );

      // Task completed, add completion event
      if (!this.aborted) {
        this.events.push({
          eventType: "complete",
          data: JSON.stringify({}),
        });
      }

      this.taskRunning = false;

      // When task completes, resolve the Promise
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
    } catch (error) {
      console.error("Error executing task:", error);

      if (!this.aborted) {
        this.events.push({
          eventType: "error",
          data: JSON.stringify({ error: String(error) }),
        });
      }

      this.taskRunning = false;

      // Resolve Promise on error
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
    }
  }

  // Wait for task completion
  waitForCompletion(): Promise<void> {
    return this.taskCompletePromise || Promise.resolve();
  }

  // Get connection status
  getStatus(): number {
    return this.status;
  }

  // Get error information
  getError(): { code?: number; type?: string; message?: string } | undefined {
    return this.error;
  }

  // Get received events
  getEvents(): Array<{ eventType: string; data: string }> {
    return this.events;
  }

  // Close connection
  close(): void {
    console.log("Closing WebSocket connection");

    if (this.taskRunning) {
      this.aborted = true;
      this.agent.cancelTask("user");
    }
  }
}

// Helper function: Find successful client
function findSuccessfulClient<T extends MockSSEClient | MockWebSocketClient>(
  clients: T[],
): T | null {
  return clients.find((client) => client.getStatus() === 200) || null;
}

Deno.test("Concurrency control - 4 SSE requests simultaneous, only 1 succeeds", async () => {
  // Create mock agent
  const mockAgent = new MockZypherAgent();
  mockAgent.mockDelay = 15000; // Set task to run for 15 seconds

  console.log("Initiating 4 concurrent SSE requests...");

  // Create 4 SSE clients, directly interacting with mockAgent
  const sseClients = [
    new MockSSEClient(mockAgent, { task: "Task 1" }),
    new MockSSEClient(mockAgent, { task: "Task 2" }),
    new MockSSEClient(mockAgent, { task: "Task 3" }),
    new MockSSEClient(mockAgent, { task: "Task 4" }),
  ];

  // Connect all clients simultaneously
  const statuses = await Promise.all(
    sseClients.map((client) => client.connect()),
  );

  // Count successful (200) and failed (409) requests
  const successCount = statuses.filter((status) => status === 200).length;
  const failureCount = statuses.filter((status) => status === 409).length;

  console.log(
    `Request results: Success=${successCount}, Failed(409)=${failureCount}`,
  );
  console.log(`Status codes: ${statuses.join(", ")}`);

  // Assert that only one request succeeded, the rest failed
  assertEquals(successCount, 1, "Only one request should succeed");
  assertEquals(failureCount, 3, "Three requests should return 409");

  // Find the successful client and wait for its task to complete
  const successfulClient = findSuccessfulClient(sseClients);
  if (successfulClient) {
    console.log("Waiting for successful task to complete...");
    await successfulClient.waitForCompletion();
  } else {
    console.error("No successful client found!");
  }

  // Assert task has completed
  assertEquals(mockAgent.isTaskRunning, false, "Task should be completed");

  // Clean up resources
  sseClients.forEach((client) => client.close());
});

Deno.test("Concurrency control - Mixed SSE and WS requests, and new request after completion", async () => {
  // Create mock agent
  const mockAgent = new MockZypherAgent();
  mockAgent.mockDelay = 15000; // Set task to run for 15 seconds

  console.log("Initiating 2 SSE and 2 WS mixed concurrent requests...");

  // Create 2 SSE clients, directly interacting with mockAgent
  const sseClients = [
    new MockSSEClient(mockAgent, { task: "SSE Task 1" }),
    new MockSSEClient(mockAgent, { task: "SSE Task 2" }),
  ];

  // Create 2 WS clients, directly interacting with mockAgent
  const wsClients = [
    new MockWebSocketClient(mockAgent),
    new MockWebSocketClient(mockAgent),
  ];

  // Connect all SSE clients simultaneously
  const sseStatuses = await Promise.all(
    sseClients.map((client) => client.connect()),
  );

  // Connect all WS clients simultaneously
  await Promise.all(
    wsClients.map((client) => client.connect({ task: "WS Task" })),
  );
  const wsStatuses = wsClients.map((client) => client.getStatus());

  // All status codes
  const allStatuses = [...sseStatuses, ...wsStatuses];

  // Count successful and failed requests
  const successCount = allStatuses.filter((status) => status === 200).length;
  const failureCount = allStatuses.filter((status) => status === 409).length;

  console.log(
    `Mixed request results: Success=${successCount}, Failed(409)=${failureCount}`,
  );
  console.log(`SSE status codes: ${sseStatuses.join(", ")}`);
  console.log(`WS status codes: ${wsStatuses.join(", ")}`);

  // Assert that only one request succeeded, the rest failed
  assertEquals(
    successCount,
    1,
    "Only one request should succeed in mixed requests",
  );
  assertEquals(
    failureCount,
    3,
    "Three requests should return 409 in mixed requests",
  );

  // Find the successful client and wait for its task to complete
  const successfulSseClient = findSuccessfulClient(sseClients);
  const successfulWsClient = findSuccessfulClient(wsClients);

  if (successfulSseClient || successfulWsClient) {
    console.log("Waiting for successful task to complete...");
    if (successfulSseClient) {
      await successfulSseClient.waitForCompletion();
    } else if (successfulWsClient) {
      await successfulWsClient.waitForCompletion();
    }
  } else {
    console.error("No successful client found!");
  }

  // Assert task has completed
  assertEquals(
    mockAgent.isTaskRunning,
    false,
    "First task should be completed",
  );

  // Initiate new SSE request
  console.log("Initiating new SSE request...");
  const newSseClient = new MockSSEClient(mockAgent, {
    task: "New Task After Completion",
  });
  const newStatus = await newSseClient.connect();

  console.log(`New request status code: ${newStatus}`);
  assertEquals(
    newStatus,
    200,
    "New request should succeed after previous task completes",
  );

  // Wait for new task to complete
  console.log("Waiting for new task to complete...");
  await newSseClient.waitForCompletion();

  // Clean up resources
  sseClients.forEach((client) => client.close());
  wsClients.forEach((client) => client.close());
  newSseClient.close();
});

Deno.test("Concurrency control - Multiple batch task request test", async () => {
  // Create mock agent
  const mockAgent = new MockZypherAgent();
  mockAgent.mockDelay = 15000; // Set task to run for 15 seconds

  console.log(
    "===== Batch 1: Initiating 2 WS and 1 SSE requests (3 total) =====",
  );

  // Create first batch clients
  const firstBatchSseClients = [
    new MockSSEClient(mockAgent, { task: "Batch 1 SSE Task" }),
  ];

  const firstBatchWsClients = [
    new MockWebSocketClient(mockAgent),
    new MockWebSocketClient(mockAgent),
  ];

  // Connect all clients simultaneously
  const firstBatchSseStatuses = await Promise.all(
    firstBatchSseClients.map((client) => client.connect()),
  );
  await Promise.all(
    firstBatchWsClients.map((client) =>
      client.connect({ task: "Batch 1 WS Task" })
    ),
  );
  const firstBatchWsStatuses = firstBatchWsClients.map((client) =>
    client.getStatus()
  );

  // All status codes
  const firstBatchStatuses = [
    ...firstBatchSseStatuses,
    ...firstBatchWsStatuses,
  ];

  // Count successful and failed requests
  const firstBatchSuccessCount =
    firstBatchStatuses.filter((status) => status === 200).length;
  const firstBatchFailureCount =
    firstBatchStatuses.filter((status) => status === 409).length;

  console.log(
    `Batch 1 request results: Success=${firstBatchSuccessCount}, Failed(409)=${firstBatchFailureCount}`,
  );
  console.log(`Batch 1 SSE status codes: ${firstBatchSseStatuses.join(", ")}`);
  console.log(`Batch 1 WS status codes: ${firstBatchWsStatuses.join(", ")}`);

  // Assert that only one request succeeded, the rest failed
  assertEquals(
    firstBatchSuccessCount,
    1,
    "Only one request should succeed in Batch 1",
  );
  assertEquals(
    firstBatchFailureCount,
    2,
    "Two requests should return 409 in Batch 1",
  );

  // Find the successful client and wait for its task to complete
  const firstBatchSuccessfulSseClient = findSuccessfulClient(
    firstBatchSseClients,
  );
  const firstBatchSuccessfulWsClient = findSuccessfulClient(
    firstBatchWsClients,
  );

  if (firstBatchSuccessfulSseClient || firstBatchSuccessfulWsClient) {
    console.log("Waiting for Batch 1 successful task to complete...");
    if (firstBatchSuccessfulSseClient) {
      await firstBatchSuccessfulSseClient.waitForCompletion();
    } else if (firstBatchSuccessfulWsClient) {
      await firstBatchSuccessfulWsClient.waitForCompletion();
    }
  } else {
    console.error("No successful client found in Batch 1!");
  }

  // Assert task has completed
  assertEquals(
    mockAgent.isTaskRunning,
    false,
    "Batch 1 task should be completed",
  );

  // Clean up first batch resources
  firstBatchSseClients.forEach((client) => client.close());
  firstBatchWsClients.forEach((client) => client.close());

  console.log(
    "\n===== Batch 2: Initiating 1 WS and 1 SSE requests (2 total) =====",
  );

  // Create second batch clients
  const secondBatchSseClients = [
    new MockSSEClient(mockAgent, { task: "Batch 2 SSE Task" }),
  ];

  const secondBatchWsClients = [
    new MockWebSocketClient(mockAgent),
  ];

  // Connect all clients simultaneously
  const secondBatchSseStatuses = await Promise.all(
    secondBatchSseClients.map((client) => client.connect()),
  );
  await Promise.all(
    secondBatchWsClients.map((client) =>
      client.connect({ task: "Batch 2 WS Task" })
    ),
  );
  const secondBatchWsStatuses = secondBatchWsClients.map((client) =>
    client.getStatus()
  );

  // All status codes
  const secondBatchStatuses = [
    ...secondBatchSseStatuses,
    ...secondBatchWsStatuses,
  ];

  // Count successful and failed requests
  const secondBatchSuccessCount =
    secondBatchStatuses.filter((status) => status === 200).length;
  const secondBatchFailureCount =
    secondBatchStatuses.filter((status) => status === 409).length;

  console.log(
    `Batch 2 request results: Success=${secondBatchSuccessCount}, Failed(409)=${secondBatchFailureCount}`,
  );
  console.log(`Batch 2 SSE status codes: ${secondBatchSseStatuses.join(", ")}`);
  console.log(`Batch 2 WS status codes: ${secondBatchWsStatuses.join(", ")}`);

  // Assert that only one request succeeded, the rest failed
  assertEquals(
    secondBatchSuccessCount,
    1,
    "Only one request should succeed in Batch 2",
  );
  assertEquals(
    secondBatchFailureCount,
    1,
    "One request should return 409 in Batch 2",
  );

  // Find the successful client and wait for its task to complete
  const secondBatchSuccessfulSseClient = findSuccessfulClient(
    secondBatchSseClients,
  );
  const secondBatchSuccessfulWsClient = findSuccessfulClient(
    secondBatchWsClients,
  );

  if (secondBatchSuccessfulSseClient || secondBatchSuccessfulWsClient) {
    console.log("Waiting for Batch 2 successful task to complete...");
    if (secondBatchSuccessfulSseClient) {
      await secondBatchSuccessfulSseClient.waitForCompletion();
    } else if (secondBatchSuccessfulWsClient) {
      await secondBatchSuccessfulWsClient.waitForCompletion();
    }
  } else {
    console.error("No successful client found in Batch 2!");
  }

  // Assert task has completed
  assertEquals(
    mockAgent.isTaskRunning,
    false,
    "Batch 2 task should be completed",
  );

  // Clean up second batch resources
  secondBatchSseClients.forEach((client) => client.close());
  secondBatchWsClients.forEach((client) => client.close());
});
