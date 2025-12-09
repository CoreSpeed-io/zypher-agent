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
  type ExecuteMessage,
  type ToolResponseMessage,
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

  try {
    worker.onmessage = async (event) => {
      const message = WorkerToHostMessageSchema.parse(event.data);

      if (message.type === "tool_use") {
        const { toolUseId, toolName, input } = message;

        let response: ToolResponseMessage;
        try {
          const result = await mcpServerManager.callTool(
            toolUseId,
            toolName,
            input,
          );
          response = { type: "tool_response", toolUseId, toolName, result };
        } catch (error) {
          response = {
            type: "tool_response",
            toolUseId,
            toolName,
            result: {
              content: [{ type: "text", text: String(error) }],
              isError: true,
            },
          };
        }
        worker.postMessage(response);
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
    const executeMessage: ExecuteMessage = {
      type: "execute",
      code,
      tools: toolNames,
    };
    worker.postMessage(executeMessage);

    return await completer.wait({ signal });
  } finally {
    worker.terminate();
  }
}
