/**
 * DenoWebWorkerController - Main thread side of PTC protocol.
 *
 * Creates a sandboxed Deno Worker with all permissions disabled.
 * Handles tool call routing and timeout enforcement via worker.terminate().
 */

import type {
  CallToolHandler,
  CodeExecutionController,
  CodeExecutionRequest,
  CodeExecutionResult,
  RunnerMessage,
  ToolCallRequest,
  ToolCallResponse,
  ToolDefinitions,
} from "../../ProgrammaticToolCallingProtocol.ts";

export interface DenoWebWorkerControllerOptions {
  /** Timeout in milliseconds. Default: 600000 (10 minutes) */
  timeout?: number;
  /** Handler for tool calls from the runner */
  onCallTool: CallToolHandler;
}

export class DenoWebWorkerController implements CodeExecutionController {
  onCallTool: CallToolHandler;
  private timeout: number;
  private worker: Worker | null = null;

  constructor(options: DenoWebWorkerControllerOptions) {
    this.onCallTool = options.onCallTool;
    this.timeout = options.timeout ?? 600_000;
  }

  execute(
    code: string,
    language: string,
    toolDefinitions: ToolDefinitions,
  ): Promise<CodeExecutionResult> {
    if (language !== "typescript") {
      return Promise.resolve({
        type: "result" as const,
        success: false,
        error:
          `Unsupported language: ${language}. Only "typescript" is supported.`,
      });
    }

    // Create sandboxed worker with all permissions disabled
    const workerUrl = new URL("./runner.ts", import.meta.url);
    this.worker = new Worker(workerUrl.href, {
      type: "module",
      deno: {
        permissions: {
          read: false,
          write: false,
          net: false,
          env: false,
          run: false,
          ffi: false,
        },
      },
    });

    return new Promise<CodeExecutionResult>((resolve) => {
      // Setup timeout - worker.terminate() forcefully kills even infinite loops
      const timeoutId = setTimeout(() => {
        this.dispose();
        resolve({
          type: "result",
          success: false,
          error: `Execution timed out after ${this.timeout}ms`,
          timedOut: true,
        });
      }, this.timeout);

      // Handle messages from worker
      this.worker!.onmessage = async (event: MessageEvent<RunnerMessage>) => {
        const msg = event.data;

        if (msg.type === "tool_call") {
          await this.handleToolCall(msg);
        } else if (msg.type === "result") {
          clearTimeout(timeoutId);
          this.dispose();
          resolve(msg);
        }
      };

      // Handle worker errors
      this.worker!.onerror = (event) => {
        clearTimeout(timeoutId);
        this.dispose();
        resolve({
          type: "result",
          success: false,
          error: `Worker error: ${event.message}`,
        });
      };

      // Send execution request to worker
      const request: CodeExecutionRequest = {
        type: "execute",
        language,
        code,
        toolDefinitions,
      };
      this.worker!.postMessage(request);
    });
  }

  private async handleToolCall(msg: ToolCallRequest): Promise<void> {
    if (!this.worker) return;

    try {
      const result = await this.onCallTool(msg.toolName, msg.args);
      const response: ToolCallResponse = {
        type: "tool_response",
        callId: msg.callId,
        result,
      };
      this.worker.postMessage(response);
    } catch (error) {
      const response: ToolCallResponse = {
        type: "tool_response",
        callId: msg.callId,
        error: error instanceof Error ? error.message : String(error),
      };
      this.worker.postMessage(response);
    }
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

/**
 * Factory function to create a new controller for each execution.
 * This prevents race conditions when multiple execute_code calls run in parallel.
 *
 * @param options - Controller options (timeout, onCallTool handler)
 * @param customController - Optional custom controller to use instead
 * @returns A new CodeExecutionController instance
 */
export function createController(
  options: DenoWebWorkerControllerOptions,
  customController?: CodeExecutionController,
): CodeExecutionController {
  return customController ?? new DenoWebWorkerController(options);
}
