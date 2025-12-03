/**
 * Runner tests - The runner executes inside a Worker, so direct unit testing
 * is not possible. These tests verify runner behavior through the controller.
 *
 * For comprehensive runner testing, see controller.test.ts which exercises
 * the full Controller <-> Runner communication.
 */

import { assertEquals } from "@std/assert";
import { DenoWebWorkerController } from "../controller.ts";

Deno.test("Runner - builds tools proxy correctly", async () => {
  const calls: string[] = [];

  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: (toolName, _args) => {
      calls.push(toolName);
      return Promise.resolve({ ok: true });
    },
  });

  try {
    // Test that tools proxy is built correctly from flat toolDefinitions
    const result = await controller.execute(
      `
      // Access tools with prefixed names
      await tools.mcp__server1__tool_a({});
      await tools.mcp__server1__tool_b({});
      await tools.mcp__server2__tool_c({});
      return { callCount: 3 };
      `,
      "typescript",
      [
        {
          name: "mcp__server1__tool_a",
          description: "Tool A",
          parameters: { type: "object" },
        },
        {
          name: "mcp__server1__tool_b",
          description: "Tool B",
          parameters: { type: "object" },
        },
        {
          name: "mcp__server2__tool_c",
          description: "Tool C",
          parameters: { type: "object" },
        },
      ],
    );

    assertEquals(result.success, true);
    assertEquals(calls, [
      "mcp__server1__tool_a",
      "mcp__server1__tool_b",
      "mcp__server2__tool_c",
    ]);
  } finally {
    controller.dispose();
  }
});

Deno.test("Runner - handles async/await correctly", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: async (_toolName, args) => {
      // Simulate async delay (this one needs await)
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { value: (args as { n: number }).n * 2 };
    },
  });

  try {
    const result = await controller.execute(
      `
      const results = await Promise.all([
        tools.mcp__math__double({ n: 1 }),
        tools.mcp__math__double({ n: 2 }),
        tools.mcp__math__double({ n: 3 }),
      ]);
      return results.map(r => r.value);
      `,
      "typescript",
      [{
        name: "mcp__math__double",
        description: "Double a number",
        parameters: { type: "object" },
      }],
    );

    assertEquals(result.success, true);
    assertEquals(result.data, [2, 4, 6]);
  } finally {
    controller.dispose();
  }
});

Deno.test("Runner - tool call with no args defaults to empty object", async () => {
  let receivedArgs: unknown;

  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: (_toolName, args) => {
      receivedArgs = args;
      return Promise.resolve({ ok: true });
    },
  });

  try {
    const result = await controller.execute(
      `
      // Call tool without arguments
      await tools.mcp__test__no_args();
      return "done";
      `,
      "typescript",
      [{
        name: "mcp__test__no_args",
        description: "No args tool",
        parameters: { type: "object" },
      }],
    );

    assertEquals(result.success, true);
    assertEquals(receivedArgs, {});
  } finally {
    controller.dispose();
  }
});

Deno.test("Runner - console output captured in order", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: () => Promise.resolve({}),
  });

  try {
    const result = await controller.execute(
      `
      console.log("first");
      console.error("second");
      console.warn("third");
      console.log("fourth");
      return null;
      `,
      "typescript",
      [],
    );

    assertEquals(result.success, true);
    assertEquals(result.logs, [
      "first",
      "[ERROR] second",
      "[WARN] third",
      "fourth",
    ]);
  } finally {
    controller.dispose();
  }
});

Deno.test("Runner - TypeScript generics work", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: () => Promise.resolve({}),
  });

  try {
    const result = await controller.execute(
      `
      function identity<T>(value: T): T {
        return value;
      }

      const num = identity<number>(42);
      const str = identity<string>("hello");

      return { num, str };
      `,
      "typescript",
      [],
    );

    assertEquals(result.success, true);
    assertEquals(result.data, { num: 42, str: "hello" });
  } finally {
    controller.dispose();
  }
});

Deno.test("Runner - async iteration works", async () => {
  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: (_toolName, args) => {
      return Promise.resolve({ id: (args as { id: number }).id });
    },
  });

  try {
    const result = await controller.execute(
      `
      const ids = [1, 2, 3, 4, 5];
      const results: number[] = [];

      for (const id of ids) {
        const data = await tools.mcp__api__fetch({ id });
        results.push(data.id);
      }

      return results;
      `,
      "typescript",
      [{
        name: "mcp__api__fetch",
        description: "Fetch data",
        parameters: { type: "object" },
      }],
    );

    assertEquals(result.success, true);
    assertEquals(result.data, [1, 2, 3, 4, 5]);
  } finally {
    controller.dispose();
  }
});

Deno.test("Runner - non-MCP tools work with plain names (no prefix)", async () => {
  const calls: string[] = [];

  const controller = new DenoWebWorkerController({
    timeout: 5000,
    onCallTool: (toolName, _args) => {
      calls.push(toolName);
      return Promise.resolve({ content: "file contents" });
    },
  });

  try {
    const result = await controller.execute(
      `
      const file = await tools.read_file({ path: "/test.txt" });
      return file.content;
      `,
      "typescript",
      [{
        name: "read_file",
        description: "Read a file",
        parameters: { type: "object" },
      }],
    );

    assertEquals(result.success, true);
    assertEquals(result.data, "file contents");
    assertEquals(calls, ["read_file"]);
  } finally {
    controller.dispose();
  }
});
