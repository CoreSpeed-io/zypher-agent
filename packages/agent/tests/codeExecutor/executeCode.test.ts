/**
 * Tests for the executeCode function which orchestrates code execution
 * in an isolated Web Worker environment with tool access.
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import z from "zod";
import type { Tool } from "@zypher/tools/mod.ts";
import type { ZypherContext } from "@zypher/mod.ts";
import { McpServerManager } from "@zypher/mod.ts";
import { executeCode } from "@zypher/tools/codeExecutor/executeCode.ts";

describe("executeCode", () => {
  let manager: McpServerManager;

  const mockContext: ZypherContext = {
    workingDirectory: "/tmp/test-workspace",
    zypherDir: "/tmp/.zypher",
    workspaceDataDir: "/tmp/.zypher/test-workspace",
    fileAttachmentCacheDir: "/tmp/.zypher/cache/files",
  };

  function createMockTool(
    name: string,
    execute: Tool["execute"] = () => Promise.resolve("ok"),
  ): Tool {
    return {
      name,
      description: `Mock tool ${name}`,
      schema: z.object({ value: z.string().optional() }),
      execute,
    };
  }

  beforeEach(() => {
    manager = new McpServerManager(mockContext);
  });

  afterEach(async () => {
    await manager.dispose();
  });

  describe("basic code execution", () => {
    it("should execute simple code and return result", async () => {
      const result = await executeCode(
        `return 1 + 2;`,
        manager,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe(3);
      expect(result.logs).toEqual([]);
    });

    it("should execute async code", async () => {
      const result = await executeCode(
        `
        await new Promise(resolve => setTimeout(resolve, 10));
        return "async done";
        `,
        manager,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe("async done");
    });

    it("should capture console logs", async () => {
      const result = await executeCode(
        `
        console.log("hello");
        console.warn("warning");
        return "done";
        `,
        manager,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe("done");
      expect(result.logs).toContain("hello");
      expect(result.logs).toContain("[WARN] warning");
    });

    it("should handle code that throws an error", async () => {
      const result = await executeCode(
        `throw new Error("test error");`,
        manager,
      );

      expect(result.success).toBe(false);
      expect((result.error as Error).message).toBe("test error");
    });

    it("should preserve logs when error occurs", async () => {
      const result = await executeCode(
        `
        console.log("before error");
        throw new Error("oops");
        `,
        manager,
      );

      expect(result.success).toBe(false);
      expect(result.logs).toContain("before error");
    });
  });

  describe("tool execution", () => {
    it("should make registered tools available to code", async () => {
      const toolCalls: unknown[] = [];
      manager.registerTool(
        createMockTool("test_tool", (input) => {
          toolCalls.push(input);
          return Promise.resolve({
            content: [{ type: "text", text: "tool result" }],
          });
        }),
      );

      const result = await executeCode(
        `
        const res = await tools.test_tool({ value: "hello" });
        return res;
        `,
        manager,
      );

      expect(result.success).toBe(true);
      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0]).toEqual({ value: "hello" });
    });

    it("should handle multiple tool calls", async () => {
      let callCount = 0;
      manager.registerTool(
        createMockTool("counter_tool", () => {
          callCount++;
          return Promise.resolve({
            content: [{ type: "text", text: String(callCount) }],
          });
        }),
      );

      const result = await executeCode(
        `
        await tools.counter_tool({});
        await tools.counter_tool({});
        await tools.counter_tool({});
        return "done";
        `,
        manager,
      );

      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
    });

    it("should handle tool errors gracefully when caught", async () => {
      manager.registerTool(
        createMockTool("failing_tool", () => {
          throw new Error("tool failure");
        }),
      );

      const result = await executeCode(
        `
        try {
          await tools.failing_tool({});
          return "no error";
        } catch (e) {
          return "caught: " + e.message;
        }
        `,
        manager,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe("caught: tool failure");
    });

    it("should propagate uncaught tool errors", async () => {
      manager.registerTool(
        createMockTool("failing_tool", () => {
          throw new Error("uncaught tool error");
        }),
      );

      const result = await executeCode(
        `
        await tools.failing_tool({});
        return "should not reach";
        `,
        manager,
      );

      expect(result.success).toBe(false);
      expect((result.error as Error).message).toBe("uncaught tool error");
    });

    it("should return tool results correctly", async () => {
      manager.registerTool(
        createMockTool("data_tool", () => {
          return Promise.resolve({
            content: [{ type: "text", text: JSON.stringify({ foo: "bar" }) }],
          });
        }),
      );

      const result = await executeCode(
        `
        const res = await tools.data_tool({});
        return res;
        `,
        manager,
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        content: [{ type: "text", text: '{"foo":"bar"}' }],
      });
    });
  });

  describe("cancellation", () => {
    it("should cancel execution when signal is aborted", async () => {
      const controller = new AbortController();

      // Abort after a short delay
      setTimeout(() => controller.abort(), 50);

      await expect(
        executeCode(
          `
          // Long running operation
          await new Promise(resolve => setTimeout(resolve, 10000));
          return "should not reach";
          `,
          manager,
          { signal: controller.signal },
        ),
      ).rejects.toThrow("Operation aborted");
    });

    it("should support AbortSignal.timeout for timeouts", async () => {
      await expect(
        executeCode(
          `
          await new Promise(resolve => setTimeout(resolve, 10000));
          return "should not reach";
          `,
          manager,
          { signal: AbortSignal.timeout(50) },
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("edge cases", () => {
    it("should handle code that returns undefined", async () => {
      const result = await executeCode(
        `
        const x = 1;
        // no return statement
        `,
        manager,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it("should handle code that returns null", async () => {
      const result = await executeCode(
        `return null;`,
        manager,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe(null);
    });

    it("should handle code that returns complex objects", async () => {
      const result = await executeCode(
        `
        return {
          nested: { value: 42 },
          array: [1, 2, 3],
          string: "hello"
        };
        `,
        manager,
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        nested: { value: 42 },
        array: [1, 2, 3],
        string: "hello",
      });
    });

    it("should handle empty code", async () => {
      const result = await executeCode("", manager);

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it("should handle code with syntax errors", async () => {
      const result = await executeCode(
        "const x = { unclosed: 'brace",
        manager,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should execute code without any registered tools", async () => {
      const result = await executeCode(
        `return Object.keys(tools).length;`,
        manager,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });
  });
});
