import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { delay } from "https://deno.land/std/async/delay.ts";

// 模拟StreamHandler类型
type MockStreamHandler = {
  onContent?: (content: string, isFirstChunk: boolean) => void;
  onToolUse?: (name: string, partialInput: Record<string, unknown>) => void;
  onMessage?: (message: unknown) => void;
  onCancelled?: (reason: "user" | "timeout") => void;
};

// 模拟ZypherAgent
class MockZypherAgent {
  private _isTaskRunning = false;
  private _cancellationReason: "user" | "timeout" | null = null;
  private _currentStreamHandler: MockStreamHandler | undefined;
  public mockDelay = 15000; // 模拟15秒的API调用，改为public以便测试中修改
  public taskTimeoutMs = 60000;

  constructor() {}

  // 实现与ZypherAgent相同的接口
  get isTaskRunning(): boolean {
    return this._isTaskRunning;
  }

  get cancellationReason(): "user" | "timeout" | null {
    return this._cancellationReason;
  }

  // 检查并设置任务运行状态
  checkAndSetTaskRunning(): boolean {
    if (this._isTaskRunning) {
      return false;
    }
    this._isTaskRunning = true;
    return true;
  }

  // 清除任务运行状态
  clearTaskRunning(): void {
    this._isTaskRunning = false;
  }

  // 获取消息
  getMessages(): unknown[] {
    return [];
  }

  // 清除消息
  clearMessages(): void {
    // 空操作
  }

  // 取消任务
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

  // 模拟运行任务，延迟15秒才完成
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
      // 模拟内容流式输出
      if (streamHandler.onContent) {
        streamHandler.onContent(`Starting task: ${task}`, true);
        await delay(100);
        streamHandler.onContent(" Processing...", false);
      }

      // 等待15秒模拟长时间运行的API调用
      const startTime = Date.now();
      while (Date.now() - startTime < this.mockDelay && this._isTaskRunning) {
        // 每秒发送一些内容，模拟持续的输出
        if (streamHandler.onContent && this._isTaskRunning) {
          streamHandler.onContent(`.`, false);
        }
        await delay(1000);
      }

      // 如果任务被取消，返回空数组
      if (!this._isTaskRunning) {
        return [];
      }

      // 完成消息
      if (streamHandler.onMessage) {
        streamHandler.onMessage({
          role: "assistant",
          content: `Task completed: ${task}`,
        });
      }

      // 任务完成，清除状态
      this._isTaskRunning = false;
      return [{ role: "assistant", content: `Task completed: ${task}` }];
    } catch (error) {
      this._isTaskRunning = false;
      throw error;
    }
  }

  // 应用检查点（空实现）
  async applyCheckpoint(_checkpointId: string): Promise<void> {
    // 空操作
  }
}

// 直接模拟SSE客户端，直接与MockZypherAgent交互
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
    // 初始化完成Promise
    this.taskCompletePromise = new Promise<void>((resolve) => {
      this.taskCompleteResolver = resolve;
    });
  }

  // 模拟SSE连接
  connect(): number {
    try {
      console.log(`模拟SSE请求: ${JSON.stringify(this.taskInfo)}`);

      // 直接调用agent的checkAndSetTaskRunning方法检查并发控制
      if (!this.agent.checkAndSetTaskRunning()) {
        this.status = 409; // 冲突状态
        console.log(`SSE请求被拒绝: 任务已在运行中`);
        // 如果请求被拒绝，立即将完成Promise解析
        if (this.taskCompleteResolver) {
          this.taskCompleteResolver();
        }
        return this.status;
      }

      this.status = 200; // 成功状态
      this.taskRunning = true;
      console.log(`SSE请求成功，开始任务`);

      // 创建事件接收处理器
      const streamHandler: MockStreamHandler = {
        onContent: (content, _isFirstChunk) => {
          if (this.aborted) return;

          this.events.push({
            eventType: "content_delta",
            data: JSON.stringify({ content }),
          });
          console.log(
            `收到内容: ${content.substring(0, 50)}${
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
          console.log(`收到消息`);
        },
        onToolUse: (name, partialInput) => {
          if (this.aborted) return;

          this.events.push({
            eventType: "tool_use_delta",
            data: JSON.stringify({ name, partialInput }),
          });
          console.log(`收到工具使用: ${name}`);
        },
        onCancelled: (reason) => {
          if (this.aborted) return;

          this.events.push({
            eventType: "cancelled",
            data: JSON.stringify({ reason }),
          });
          console.log(`任务已取消，原因: ${reason}`);
          this.taskRunning = false;

          // 任务取消时，解析Promise
          if (this.taskCompleteResolver) {
            this.taskCompleteResolver();
          }
        },
      };

      // 异步运行任务
      this.runTask(streamHandler).catch((err) => {
        console.error("运行SSE任务时出错:", err);
        // 出错时也解析Promise
        if (this.taskCompleteResolver) {
          this.taskCompleteResolver();
        }
      });

      return this.status;
    } catch (error) {
      console.error("模拟SSE请求出错:", error);
      // 出错时也解析Promise
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
      return 500;
    }
  }

  // 异步运行任务
  private async runTask(streamHandler: MockStreamHandler): Promise<void> {
    try {
      // 直接调用agent的runTaskWithStreaming方法
      const _messages = await this.agent.runTaskWithStreaming(
        this.taskInfo.task,
        streamHandler,
        [],
      );

      // 任务完成，添加完成事件
      if (!this.aborted) {
        this.events.push({
          eventType: "complete",
          data: JSON.stringify({}),
        });
        console.log(`任务完成`);
      }

      this.taskRunning = false;

      // 任务完成时，解析Promise
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
    } catch (error) {
      console.error("任务执行出错:", error);

      if (!this.aborted) {
        this.events.push({
          eventType: "error",
          data: JSON.stringify({ error: String(error) }),
        });
      }

      this.taskRunning = false;

      // 出错时也解析Promise
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
    }
  }

  // 等待任务完成
  waitForCompletion(): Promise<void> {
    return this.taskCompletePromise || Promise.resolve();
  }

  // 关闭连接
  close(): void {
    console.log("关闭SSE连接");

    if (this.taskRunning) {
      this.aborted = true;
      this.agent.cancelTask("user");
    }
  }

  // 获取接收到的事件
  getEvents(): Array<{ eventType: string; data: string }> {
    return this.events;
  }

  // 获取连接状态码
  getStatus(): number {
    return this.status;
  }
}

// 直接模拟WebSocket客户端，直接与MockZypherAgent交互
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
    // 初始化完成Promise
    this.taskCompletePromise = new Promise<void>((resolve) => {
      this.taskCompleteResolver = resolve;
    });
  }

  // 模拟WebSocket连接
  async connect(taskInfo: { task: string }): Promise<void> {
    console.log(`模拟WebSocket连接: ${JSON.stringify(taskInfo)}`);

    // 模拟连接延迟
    await delay(10);

    // 直接调用agent的checkAndSetTaskRunning方法
    if (!this.agent.checkAndSetTaskRunning()) {
      this.status = 409;
      this.error = {
        code: 409,
        type: "task_in_progress",
        message: "A task is already running",
      };
      console.log(`WebSocket连接失败: ${this.error.message}`);

      // 如果请求被拒绝，立即将完成Promise解析
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
      return;
    }

    this.status = 200;
    this.taskRunning = true;
    console.log(`WebSocket连接成功，任务已启动`);

    // 创建事件接收处理器
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

        // 任务取消时，解析Promise
        if (this.taskCompleteResolver) {
          this.taskCompleteResolver();
        }
      },
    };

    // 异步运行任务
    this.runTask(taskInfo.task, streamHandler).catch((err) => {
      console.error("运行WebSocket任务时出错:", err);
      // 出错时也解析Promise
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
    });
  }

  // 异步运行任务
  private async runTask(
    task: string,
    streamHandler: MockStreamHandler,
  ): Promise<void> {
    try {
      // 直接调用agent的runTaskWithStreaming方法
      const _messages = await this.agent.runTaskWithStreaming(
        task,
        streamHandler,
        [],
      );

      // 任务完成，添加完成事件
      if (!this.aborted) {
        this.events.push({
          eventType: "complete",
          data: JSON.stringify({}),
        });
      }

      this.taskRunning = false;

      // 任务完成时，解析Promise
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
    } catch (error) {
      console.error("任务执行出错:", error);

      if (!this.aborted) {
        this.events.push({
          eventType: "error",
          data: JSON.stringify({ error: String(error) }),
        });
      }

      this.taskRunning = false;

      // 出错时也解析Promise
      if (this.taskCompleteResolver) {
        this.taskCompleteResolver();
      }
    }
  }

  // 等待任务完成
  waitForCompletion(): Promise<void> {
    return this.taskCompletePromise || Promise.resolve();
  }

  // 获取连接状态
  getStatus(): number {
    return this.status;
  }

  // 获取错误信息
  getError(): { code?: number; type?: string; message?: string } | undefined {
    return this.error;
  }

  // 获取接收到的事件
  getEvents(): Array<{ eventType: string; data: string }> {
    return this.events;
  }

  // 关闭连接
  close(): void {
    console.log("关闭WebSocket连接");

    if (this.taskRunning) {
      this.aborted = true;
      this.agent.cancelTask("user");
    }
  }
}

// 辅助函数：找出成功的客户端
function findSuccessfulClient<T extends MockSSEClient | MockWebSocketClient>(
  clients: T[],
): T | null {
  return clients.find((client) => client.getStatus() === 200) || null;
}

Deno.test("并发控制 - 4个SSE请求同时进行，只有1个成功", async () => {
  // 创建模拟agent
  const mockAgent = new MockZypherAgent();
  mockAgent.mockDelay = 15000; // 设置任务运行15秒

  console.log("发起4个并发SSE请求...");

  // 创建4个SSE客户端，直接与mockAgent交互
  const sseClients = [
    new MockSSEClient(mockAgent, { task: "Task 1" }),
    new MockSSEClient(mockAgent, { task: "Task 2" }),
    new MockSSEClient(mockAgent, { task: "Task 3" }),
    new MockSSEClient(mockAgent, { task: "Task 4" }),
  ];

  // 同时连接所有客户端
  const statuses = await Promise.all(
    sseClients.map((client) => client.connect()),
  );

  // 计算成功(200)和失败(409)的请求数
  const successCount = statuses.filter((status) => status === 200).length;
  const failureCount = statuses.filter((status) => status === 409).length;

  console.log(`请求结果: 成功=${successCount}, 失败(409)=${failureCount}`);
  console.log(`状态码列表: ${statuses.join(", ")}`);

  // 断言只有一个请求成功，其余失败
  assertEquals(successCount, 1, "应该只有一个请求成功");
  assertEquals(failureCount, 3, "应该有三个请求返回409");

  // 找到成功的客户端并等待它完成任务
  const successfulClient = findSuccessfulClient(sseClients);
  if (successfulClient) {
    console.log("等待成功的任务完成...");
    await successfulClient.waitForCompletion();
  } else {
    console.error("没有找到成功的客户端！");
  }

  // 断言任务已完成
  assertEquals(mockAgent.isTaskRunning, false, "任务应该已经完成");

  // 清理资源
  sseClients.forEach((client) => client.close());
});

Deno.test("并发控制 - 混合SSE和WS请求，以及任务完成后新请求的处理", async () => {
  // 创建模拟agent
  const mockAgent = new MockZypherAgent();
  mockAgent.mockDelay = 15000; // 设置任务运行15秒

  console.log("发起2个SSE和2个WS混合并发请求...");

  // 创建2个SSE客户端，直接与mockAgent交互
  const sseClients = [
    new MockSSEClient(mockAgent, { task: "SSE Task 1" }),
    new MockSSEClient(mockAgent, { task: "SSE Task 2" }),
  ];

  // 创建2个WS客户端，直接与mockAgent交互
  const wsClients = [
    new MockWebSocketClient(mockAgent),
    new MockWebSocketClient(mockAgent),
  ];

  // 同时连接所有SSE客户端
  const sseStatuses = await Promise.all(
    sseClients.map((client) => client.connect()),
  );

  // 同时连接所有WS客户端
  await Promise.all(
    wsClients.map((client) => client.connect({ task: "WS Task" })),
  );
  const wsStatuses = wsClients.map((client) => client.getStatus());

  // 所有状态码
  const allStatuses = [...sseStatuses, ...wsStatuses];

  // 计算成功和失败的请求数
  const successCount = allStatuses.filter((status) => status === 200).length;
  const failureCount = allStatuses.filter((status) => status === 409).length;

  console.log(`混合请求结果: 成功=${successCount}, 失败(409)=${failureCount}`);
  console.log(`SSE状态码: ${sseStatuses.join(", ")}`);
  console.log(`WS状态码: ${wsStatuses.join(", ")}`);

  // 断言只有一个请求成功，其余失败
  assertEquals(successCount, 1, "混合请求中应该只有一个请求成功");
  assertEquals(failureCount, 3, "混合请求中应该有三个请求返回409");

  // 找到成功的客户端并等待它完成任务
  const successfulSseClient = findSuccessfulClient(sseClients);
  const successfulWsClient = findSuccessfulClient(wsClients);

  if (successfulSseClient || successfulWsClient) {
    console.log("等待成功的任务完成...");
    if (successfulSseClient) {
      await successfulSseClient.waitForCompletion();
    } else if (successfulWsClient) {
      await successfulWsClient.waitForCompletion();
    }
  } else {
    console.error("没有找到成功的客户端！");
  }

  // 确认任务已完成
  assertEquals(mockAgent.isTaskRunning, false, "第一个任务应该已经完成");

  // 发起新的SSE请求
  console.log("发起新的SSE请求...");
  const newSseClient = new MockSSEClient(mockAgent, {
    task: "New Task After Completion",
  });
  const newStatus = await newSseClient.connect();

  console.log(`新请求状态码: ${newStatus}`);
  assertEquals(newStatus, 200, "在前一个任务完成后，新请求应该成功");

  // 等待新任务完成
  console.log("等待新任务完成...");
  await newSseClient.waitForCompletion();

  // 清理资源
  sseClients.forEach((client) => client.close());
  wsClients.forEach((client) => client.close());
  newSseClient.close();
});

Deno.test("并发控制 - 多批次任务请求测试", async () => {
  // 创建模拟agent
  const mockAgent = new MockZypherAgent();
  mockAgent.mockDelay = 15000; // 设置任务运行15秒

  console.log("===== 第一批：发起2个WS和1个SSE共3个并发请求 =====");

  // 创建第一批客户端
  const firstBatchSseClients = [
    new MockSSEClient(mockAgent, { task: "第一批SSE任务" }),
  ];

  const firstBatchWsClients = [
    new MockWebSocketClient(mockAgent),
    new MockWebSocketClient(mockAgent),
  ];

  // 同时连接所有客户端
  const firstBatchSseStatuses = await Promise.all(
    firstBatchSseClients.map((client) => client.connect()),
  );
  await Promise.all(
    firstBatchWsClients.map((client) =>
      client.connect({ task: "第一批WS任务" })
    ),
  );
  const firstBatchWsStatuses = firstBatchWsClients.map((client) =>
    client.getStatus()
  );

  // 所有状态码
  const firstBatchStatuses = [
    ...firstBatchSseStatuses,
    ...firstBatchWsStatuses,
  ];

  // 计算成功和失败的请求数
  const firstBatchSuccessCount =
    firstBatchStatuses.filter((status) => status === 200).length;
  const firstBatchFailureCount =
    firstBatchStatuses.filter((status) => status === 409).length;

  console.log(
    `第一批请求结果: 成功=${firstBatchSuccessCount}, 失败(409)=${firstBatchFailureCount}`,
  );
  console.log(`第一批SSE状态码: ${firstBatchSseStatuses.join(", ")}`);
  console.log(`第一批WS状态码: ${firstBatchWsStatuses.join(", ")}`);

  // 断言只有一个请求成功，其余失败
  assertEquals(firstBatchSuccessCount, 1, "第一批请求中应该只有一个请求成功");
  assertEquals(firstBatchFailureCount, 2, "第一批请求中应该有两个请求返回409");

  // 找到成功的客户端并等待它完成任务
  const firstBatchSuccessfulSseClient = findSuccessfulClient(
    firstBatchSseClients,
  );
  const firstBatchSuccessfulWsClient = findSuccessfulClient(
    firstBatchWsClients,
  );

  if (firstBatchSuccessfulSseClient || firstBatchSuccessfulWsClient) {
    console.log("等待第一批成功的任务完成...");
    if (firstBatchSuccessfulSseClient) {
      await firstBatchSuccessfulSseClient.waitForCompletion();
    } else if (firstBatchSuccessfulWsClient) {
      await firstBatchSuccessfulWsClient.waitForCompletion();
    }
  } else {
    console.error("第一批中没有找到成功的客户端！");
  }

  // 确认任务已完成
  assertEquals(mockAgent.isTaskRunning, false, "第一批任务应该已经完成");

  // 清理第一批资源
  firstBatchSseClients.forEach((client) => client.close());
  firstBatchWsClients.forEach((client) => client.close());

  console.log("\n===== 第二批：发起1个WS和1个SSE共2个并发请求 =====");

  // 创建第二批客户端
  const secondBatchSseClients = [
    new MockSSEClient(mockAgent, { task: "第二批SSE任务" }),
  ];

  const secondBatchWsClients = [
    new MockWebSocketClient(mockAgent),
  ];

  // 同时连接所有客户端
  const secondBatchSseStatuses = await Promise.all(
    secondBatchSseClients.map((client) => client.connect()),
  );
  await Promise.all(
    secondBatchWsClients.map((client) =>
      client.connect({ task: "第二批WS任务" })
    ),
  );
  const secondBatchWsStatuses = secondBatchWsClients.map((client) =>
    client.getStatus()
  );

  // 所有状态码
  const secondBatchStatuses = [
    ...secondBatchSseStatuses,
    ...secondBatchWsStatuses,
  ];

  // 计算成功和失败的请求数
  const secondBatchSuccessCount =
    secondBatchStatuses.filter((status) => status === 200).length;
  const secondBatchFailureCount =
    secondBatchStatuses.filter((status) => status === 409).length;

  console.log(
    `第二批请求结果: 成功=${secondBatchSuccessCount}, 失败(409)=${secondBatchFailureCount}`,
  );
  console.log(`第二批SSE状态码: ${secondBatchSseStatuses.join(", ")}`);
  console.log(`第二批WS状态码: ${secondBatchWsStatuses.join(", ")}`);

  // 断言只有一个请求成功，其余失败
  assertEquals(secondBatchSuccessCount, 1, "第二批请求中应该只有一个请求成功");
  assertEquals(secondBatchFailureCount, 1, "第二批请求中应该有一个请求返回409");

  // 找到成功的客户端并等待它完成任务
  const secondBatchSuccessfulSseClient = findSuccessfulClient(
    secondBatchSseClients,
  );
  const secondBatchSuccessfulWsClient = findSuccessfulClient(
    secondBatchWsClients,
  );

  if (secondBatchSuccessfulSseClient || secondBatchSuccessfulWsClient) {
    console.log("等待第二批成功的任务完成...");
    if (secondBatchSuccessfulSseClient) {
      await secondBatchSuccessfulSseClient.waitForCompletion();
    } else if (secondBatchSuccessfulWsClient) {
      await secondBatchSuccessfulWsClient.waitForCompletion();
    }
  } else {
    console.error("第二批中没有找到成功的客户端！");
  }

  // 确认任务已完成
  assertEquals(mockAgent.isTaskRunning, false, "第二批任务应该已经完成");

  // 清理第二批资源
  secondBatchSseClients.forEach((client) => client.close());
  secondBatchWsClients.forEach((client) => client.close());
});
