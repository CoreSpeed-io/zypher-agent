/**
 * High-level API for executing code in an isolated Web Worker environment.
 *
 * Provides a simple interface to run TypeScript/JavaScript code with tool access
 * and cancellation support. Manages the worker lifecycle and message passing internally.
 */

import type { McpServerManager } from "../../mcp/mod.ts";
import { Completer } from "../../utils/mod.ts";
import {
  type CodeExecutionResult,
  type HostToWorkerMessage,
  WorkerToHostMessageSchema,
} from "./protocol.ts";

export interface ExecuteCodeOptions {
  /**
   * AbortSignal to cancel the code execution. Use AbortSignal.timeout(ms) for timeouts.
   */
  signal?: AbortSignal;
}

export async function executeCode(
  code: string,
  mcpServerManager: McpServerManager,
  options: ExecuteCodeOptions = {},
): Promise<CodeExecutionResult> {
  const { signal } = options;

  const completer = new Completer<CodeExecutionResult>();
  const worker = new Worker(
    new URL("./worker.ts", import.meta.url),
    { type: "module" },
  );

  function postMessage(message: HostToWorkerMessage) {
    worker.postMessage(message);
  }

  try {
    worker.onmessage = async (event) => {
      const message = WorkerToHostMessageSchema.parse(event.data);

      if (message.type === "tool_use") {
        const { toolUseId, toolName, input } = message;

        try {
          const result = await mcpServerManager.callTool(
            toolUseId,
            toolName,
            input,
          );
          postMessage({
            type: "tool_response",
            toolUseId,
            toolName,
            result,
          });
        } catch (error) {
          postMessage({
            type: "tool_error",
            toolUseId,
            toolName,
            error,
          });
        }
      } else {
        completer.resolve(message);
      }
    };

    worker.onerror = (error) => {
      completer.resolve({
        type: "code_execution_result",
        success: false,
        error: error.message,
        logs: [],
      });
    };

    const toolNames = Array.from(mcpServerManager.tools.keys());
    postMessage({
      type: "execute",
      code,
      tools: toolNames,
    });

    return await completer.wait({ signal });
  } finally {
    worker.terminate();
  }
}
