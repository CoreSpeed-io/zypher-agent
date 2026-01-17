/**
 * Worker tests - Tests the worker by communicating with it directly
 * via postMessage/onmessage to verify tool proxy behavior and code execution.
 */

import { assertEquals } from "@std/assert";
import { Completer } from "@zypher/utils";
import type { CodeExecutionResult } from "./protocol.ts";

Deno.test("worker - builds tools proxy correctly", async () => {
  const toolCalls: Array<{ toolName: string; input: unknown }> = [];
  const completer = new Completer<CodeExecutionResult>();

  const worker = new Worker(
    new URL("./worker.ts", import.meta.url),
    {
      type: "module",
    },
  );

  try {
    worker.onmessage = (event) => {
      const data = event.data;

      if (data.type === "tool_use") {
        toolCalls.push({ toolName: data.toolName, input: data.input });
        // Respond with a successful tool result
        worker.postMessage({
          type: "tool_response",
          toolUseId: data.toolUseId,
          toolName: data.toolName,
          result: { content: [{ type: "text", text: "ok" }] },
        });
      } else if (data.type === "code_execution_result") {
        completer.resolve(data);
      }
    };

    worker.postMessage({
      type: "execute",
      code: `
      // Access tools with prefixed names
      await tools.mcp__server1__tool_a({});
      await tools.mcp__server1__tool_b({});
      await tools.mcp__server2__tool_c({});
      return { callCount: 3 };
    `,
      tools: [
        "mcp__server1__tool_a",
        "mcp__server1__tool_b",
        "mcp__server2__tool_c",
      ],
    });

    const result = await completer.wait();

    assertEquals(result.success, true);
    assertEquals(result.data, { callCount: 3 });
    assertEquals(toolCalls.length, 3);
    assertEquals(toolCalls[0].toolName, "mcp__server1__tool_a");
    assertEquals(toolCalls[1].toolName, "mcp__server1__tool_b");
    assertEquals(toolCalls[2].toolName, "mcp__server2__tool_c");
  } finally {
    worker.terminate();
  }
});

Deno.test("worker - captures console output", async () => {
  const completer = new Completer<CodeExecutionResult>();

  const worker = new Worker(
    new URL("./worker.ts", import.meta.url),
    {
      type: "module",
    },
  );

  try {
    worker.onmessage = (event) => {
      if (event.data.type === "code_execution_result") {
        completer.resolve(event.data);
      }
    };

    worker.postMessage({
      type: "execute",
      code: `
        console.log("hello");
        console.info("info message");
        console.debug("debug message");
        console.warn("warning");
        console.error("error message");
        console.log({ foo: "bar" });
        return "done";
      `,
      tools: [],
    });

    const result = await completer.wait();

    assertEquals(result.success, true);
    assertEquals(result.data, "done");
    assertEquals(result.logs, [
      "hello",
      "[INFO] info message",
      "[DEBUG] debug message",
      "[WARN] warning",
      "[ERROR] error message",
      '{"foo":"bar"}',
    ]);
  } finally {
    worker.terminate();
  }
});

Deno.test("worker - handles exceptions and preserves logs", async () => {
  const completer = new Completer<CodeExecutionResult>();

  const worker = new Worker(
    new URL("./worker.ts", import.meta.url),
    {
      type: "module",
    },
  );

  try {
    worker.onmessage = (event) => {
      if (event.data.type === "code_execution_result") {
        completer.resolve(event.data);
      }
    };

    worker.postMessage({
      type: "execute",
      code: `
        console.log("before error");
        throw new Error("something went wrong");
        console.log("after error");
      `,
      tools: [],
    });

    const result = await completer.wait();

    assertEquals(result.success, false);
    assertEquals(result.logs, ["before error"]);
    assertEquals((result.error as Error).message, "something went wrong");
  } finally {
    worker.terminate();
  }
});
