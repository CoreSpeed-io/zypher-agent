import { assertEquals, assertExists } from "@std/assert";
import { DenoWebWorkerController } from "../controller.ts";

Deno.test("DenoWebWorkerController - basic code execution", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: () => Promise.resolve({ mock: true }),
  });

  try {
    const result = await controller.execute(
      `return { sum: 1 + 2 };`,
      "typescript",
      [],
    );

    assertEquals(result.success, true);
    assertEquals(result.data, { sum: 3 });
  } finally {
    controller.dispose();
  }
});

Deno.test("DenoWebWorkerController - TypeScript type annotations", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: () => Promise.resolve({}),
  });

  try {
    const result = await controller.execute(
      `
      interface Item { value: number }
      const items: Item[] = [{ value: 1 }, { value: 2 }, { value: 3 }];
      const total: number = items.reduce((sum, item) => sum + item.value, 0);
      return { total };
      `,
      "typescript",
      [],
    );

    assertEquals(result.success, true);
    assertEquals(result.data, { total: 6 });
  } finally {
    controller.dispose();
  }
});

Deno.test("DenoWebWorkerController - tool call via RPC", async () => {
  const toolCalls: { toolName: string; args: unknown }[] = [];

  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: (toolName, args) => {
      toolCalls.push({ toolName, args });
      return Promise.resolve({ echoed: args });
    },
  });

  try {
    const result = await controller.execute(
      `return await tools.mcp__test__echo({ msg: "hello" });`,
      "typescript",
      [{
        name: "mcp__test__echo",
        description: "Echo tool",
        parameters: { type: "object" },
      }],
    );

    assertEquals(result.success, true);
    assertEquals(result.data, { echoed: { msg: "hello" } });
    assertEquals(toolCalls.length, 1);
    assertEquals(toolCalls[0].toolName, "mcp__test__echo");
    assertEquals(toolCalls[0].args, { msg: "hello" });
  } finally {
    controller.dispose();
  }
});

Deno.test("DenoWebWorkerController - multiple tool calls", async () => {
  let callCount = 0;

  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: (toolName, args) => {
      callCount++;
      if (toolName === "mcp__stock__get_price") {
        const ticker = (args as { ticker: string }).ticker;
        return Promise.resolve({
          ticker,
          price: ticker === "AAPL" ? 150 : 200,
        });
      }
      return Promise.resolve({});
    },
  });

  try {
    const result = await controller.execute(
      `
      const aapl = await tools.mcp__stock__get_price({ ticker: "AAPL" });
      const googl = await tools.mcp__stock__get_price({ ticker: "GOOGL" });
      return { aapl: aapl.price, googl: googl.price, total: aapl.price + googl.price };
      `,
      "typescript",
      [{
        name: "mcp__stock__get_price",
        description: "Get stock price",
        parameters: { type: "object" },
      }],
    );

    assertEquals(result.success, true);
    assertEquals(result.data, { aapl: 150, googl: 200, total: 350 });
    assertEquals(callCount, 2);
  } finally {
    controller.dispose();
  }
});

Deno.test("DenoWebWorkerController - captures console.log", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: () => Promise.resolve({}),
  });

  try {
    const result = await controller.execute(
      `
      console.log("debug message");
      console.warn("warning message");
      return "done";
      `,
      "typescript",
      [],
    );

    assertEquals(result.success, true);
    assertEquals(result.data, "done");
    assertExists(result.logs);
    assertEquals(result.logs?.length, 2);
    assertEquals(result.logs?.[0], "debug message");
    assertEquals(result.logs?.[1], "[WARN] warning message");
  } finally {
    controller.dispose();
  }
});

Deno.test("DenoWebWorkerController - handles runtime errors", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: () => Promise.resolve({}),
  });

  try {
    const result = await controller.execute(
      `throw new Error("test error");`,
      "typescript",
      [],
    );

    assertEquals(result.success, false);
    assertEquals(result.error?.includes("test error"), true);
  } finally {
    controller.dispose();
  }
});

Deno.test("DenoWebWorkerController - handles tool call errors", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: () => {
      return Promise.reject(new Error("Tool execution failed"));
    },
  });

  try {
    const result = await controller.execute(
      `
      try {
        await tools.mcp__test__failing_tool({});
        return { success: true };
      } catch (e) {
        return { error: e.message };
      }
      `,
      "typescript",
      [{
        name: "mcp__test__failing_tool",
        description: "A tool that fails",
        parameters: { type: "object" },
      }],
    );

    assertEquals(result.success, true);
    assertEquals(result.data, { error: "Tool execution failed" });
  } finally {
    controller.dispose();
  }
});

Deno.test("DenoWebWorkerController - timeout kills execution", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 100, // Very short timeout
    onCallTool: () => Promise.resolve({}),
  });

  try {
    const result = await controller.execute(
      `
      // Infinite loop that should be killed
      while (true) {
        // busy wait
      }
      `,
      "typescript",
      [],
    );

    assertEquals(result.success, false);
    assertEquals(result.timedOut, true);
  } finally {
    controller.dispose();
  }
});

Deno.test("DenoWebWorkerController - unsupported language", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: () => Promise.resolve({}),
  });

  try {
    const result = await controller.execute(
      `print("hello")`,
      "python",
      [],
    );

    assertEquals(result.success, false);
    assertEquals(result.error?.includes("Unsupported language"), true);
  } finally {
    controller.dispose();
  }
});

Deno.test("DenoWebWorkerController - rejects unsupported language", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: () => Promise.resolve({}),
  });

  try {
    const result = await controller.execute(
      `return { result: "test" };`,
      "javascript",
      [],
    );

    assertEquals(result.success, false);
    assertEquals(
      result.error,
      'Unsupported language: javascript. Only "typescript" is supported.',
    );
  } finally {
    controller.dispose();
  }
});
