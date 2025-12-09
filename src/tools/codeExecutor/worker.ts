/**
 * Web Worker entrypoint that executes user-provided TypeScript/JavaScript code in an isolated context.
 *
 * Receives code via postMessage, executes it with access to a tools proxy, and returns
 * the result along with captured console output. Tool calls are forwarded to the host.
 */

/// <reference lib="deno.worker" />

import { Completer } from "../../utils/mod.ts";
import type { ToolResult } from "../mod.ts";
import { encodeBase64 } from "@std/encoding/base64";
import { HostToWorkerMessageSchema } from "./protocol.ts";
import type { CodeExecutionResult, ToolUseMessage } from "./protocol.ts";

type ToolsProxy = Record<string, (input: unknown) => Promise<unknown>>;

function callTool(
  toolName: string,
  input: unknown,
): Promise<ToolResult> {
  const toolUseId = `code-runner-${crypto.randomUUID()}`;
  const completer = new Completer<ToolResult>();
  pendingToolCalls.set(toolUseId, completer);
  postMessage({
    type: "tool_use",
    toolUseId,
    toolName,
    input,
  });
  return completer.wait();
}

function buildToolsProxy(tools: string[]): ToolsProxy {
  return Object.fromEntries(
    tools.map((t) => [
      t,
      (input: unknown): Promise<ToolResult> => callTool(t, input),
    ]),
  );
}

async function executeCode(code: string, tools: ToolsProxy): Promise<unknown> {
  const moduleCode = `export default async function(tools) {\n${code}\n}`;
  const dataUrl = `data:application/typescript;base64,${
    encodeBase64(
      new TextEncoder().encode(moduleCode),
    )
  }`;
  return (await import(dataUrl)).default(tools);
}

function postMessage(message: ToolUseMessage | CodeExecutionResult) {
  self.postMessage(message);
}

// ============================================================================
// Code Runner Entry Point
// ============================================================================

const pendingToolCalls = new Map<string, Completer<ToolResult>>();
const logs: string[] = [];

// setup console logging
const stringify = (v: unknown) =>
  typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
const format = (args: unknown[]) => args.map(stringify).join(" ");
console.log = (...args: unknown[]) => logs.push(format(args));
console.info = (...args: unknown[]) => logs.push(`[INFO] ${format(args)}`);
console.debug = (...args: unknown[]) => logs.push(`[DEBUG] ${format(args)}`);
console.warn = (...args: unknown[]) => logs.push(`[WARN] ${format(args)}`);
console.error = (...args: unknown[]) => logs.push(`[ERROR] ${format(args)}`);

self.onmessage = async (e) => {
  const parsed = HostToWorkerMessageSchema.parse(e.data);
  switch (parsed.type) {
    case "execute":
      try {
        const result = await executeCode(
          parsed.code,
          buildToolsProxy(parsed.tools),
        );
        postMessage({
          type: "code_execution_result",
          success: true,
          data: result,
          logs,
        });
      } catch (error) {
        postMessage({
          type: "code_execution_result",
          success: false,
          error,
          logs,
        });
      }
      break;

    case "tool_response": {
      const pendingCompleter = pendingToolCalls.get(parsed.toolUseId);
      if (!pendingCompleter) return;
      const result = parsed.result;
      pendingToolCalls.delete(parsed.toolUseId);
      if (typeof result === "string") {
        pendingCompleter.resolve(result);
      } else {
        result.isError
          ? pendingCompleter.reject(new Error(JSON.stringify(result.content)))
          : pendingCompleter.resolve(result);
      }
      break;
    }

    case "tool_error": {
      const pendingCompleter = pendingToolCalls.get(parsed.toolUseId);
      if (!pendingCompleter) return;
      pendingToolCalls.delete(parsed.toolUseId);
      pendingCompleter.reject(parsed.error);
      break;
    }
  }
};
