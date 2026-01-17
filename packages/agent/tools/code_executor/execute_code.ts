/**
 * High-level API for executing code in an isolated Web Worker environment.
 *
 * Provides a simple interface to run TypeScript/JavaScript code with tool access
 * and cancellation support. Manages the worker lifecycle and message passing internally.
 */

import type { McpServerManager } from "../../mcp/mod.ts";
import { Completer } from "@zypher/utils";
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

/**
 * Executes TypeScript/JavaScript code in an isolated Web Worker environment.
 *
 * The code has access to a `tools` proxy object for calling registered tools.
 * Tool calls are routed through the McpServerManager for execution.
 *
 * @param code - The TypeScript/JavaScript code to execute
 * @param mcpServerManager - Manager providing access to registered tools
 * @param options - Execution options including abort signal for cancellation
 * @returns Promise resolving to the execution result with data, logs, and success status
 */
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
          // Send error back to worker instead of rejecting the completer here.
          // This allows the agent's code to handle tool errors gracefully via try/catch,
          // rather than terminating the entire code execution on the first tool failure.
          // The worker will throw this error, which the agent code can catch and handle.
          postMessage({
            type: "tool_error",
            toolUseId,
            toolName,
            error,
          });
        }
      } else {
        // Message is a CodeExecutionResult - the worker has finished executing the code
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
