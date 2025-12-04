/**
 * Code Execution Tool - enables LLM to execute JavaScript with MCP tool access.
 *
 * Uses Programmatic Tool Calling (PTC) protocol to run code in an isolated
 * Worker with access to MCP tools via RPC, significantly reducing token usage.
 */

import * as z from "zod";
import { createTool, type Tool } from "./mod.ts";
import type { McpServerManager } from "../mcp/McpServerManager.ts";
import type { CodeExecutionController } from "./codeExecution/ProgrammaticToolCallingProtocol.ts";
import { createController } from "./codeExecution/implementation/denowebworker/controller.ts";
import { buildToolDefinitions } from "./codeExecution/ToolDefinitionBuilder.ts";

/** Callback when a tool is invoked from code execution */
export type OnToolUseCallback = (
  toolName: string,
  args: unknown,
) => void;

export interface CodeExecutionToolOptions {
  /** Execution timeout in milliseconds. Default: 600000 (10 minutes) */
  timeout?: number;
  /** Custom CodeExecutionController. Default: DenoWebWorker implementation */
  controller?: CodeExecutionController;
  /** Callback when a tool is invoked from code execution runner */
  // FIXME: refactor to agent hooks rather than specific to code execution tool
  onToolUse?: OnToolUseCallback;
}

/**
 * Creates a tool that executes JavaScript code with access to MCP tools.
 *
 * The code runs in an isolated Deno Worker with all permissions disabled.
 * Tool calls are proxied through the main thread via RPC.
 *
 * @param mcpServerManager - MCP server manager for tool routing
 * @param options - Optional configuration (timeout, custom controller)
 * @returns Tool instance for execute_code
 */
export function createCodeExecutionTool(
  mcpServerManager: McpServerManager,
  options: CodeExecutionToolOptions = {},
): Tool {
  const timeout = options.timeout ?? 600_000;
  const onToolUse = options.onToolUse;

  // Create tool call handler that routes to appropriate tools
  // Both built-in tools (e.g., "read_file") and MCP tools (e.g., "mcp__slack__send_message")
  // are looked up via mcpServerManager.getTool() which handles both cases
  const onCallTool = async (
    toolName: string,
    args: unknown,
  ): Promise<unknown> => {
    // Emit tool use callback if provided
    onToolUse?.(toolName, args);

    // Unified tool lookup - works for both built-in and MCP tools
    const tool = mcpServerManager.getTool(toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found`);
    }

    const result = await tool.execute(
      (args as Record<string, unknown>) ?? {},
      mcpServerManager.context,
    );

    // If result is a string, return it directly; otherwise parse MCP result
    if (typeof result === "string") {
      return result;
    }
    const mcpResult = result as {
      content?: { type: string; text?: string }[];
    };
    const textContent = mcpResult.content?.find((c) => c.type === "text");
    const text = textContent?.text ?? "";
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  return createTool({
    name: "execute_code",
    description: `Execute TypeScript code with access to tools.

## Usage
Write the BODY of an async function. You have access to a \`tools\` object.

- MCP tools: \`await tools.mcp__serverName__toolName({ arg: value })\`
- Non-MCP tools: \`await tools.toolName({ arg: value })\`
- Use console.log() for debugging (output is captured)
- RETURN the final result (will be JSON stringified)

## Example
\`\`\`typescript
// Get stock data and calculate average
const data = await tools.mcp__yfinance__get_stock_history({ ticker: "AAPL", period: "1y" });
const prices: number[] = data.map((d: { close: number }) => d.close);
const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
return { ticker: "AAPL", averagePrice: avg.toFixed(2), dataPoints: data.length };
\`\`\`

## Guidelines
1. Return concise summaries, not raw data
2. Handle errors with try/catch if needed
3. Timeout: ${timeout / 1000} seconds
`,
    schema: z.object({
      code: z.string().describe("The TypeScript code body to execute."),
    }),
    allowedCallers: ["model"],

    execute: async ({ code }) => {
      // Create a new controller for each execution to support parallel calls
      const controller = createController(
        { timeout, onCallTool },
        options.controller,
      );
      const toolDefinitions = buildToolDefinitions(mcpServerManager);
      const result = await controller.execute(
        code,
        "typescript",
        toolDefinitions,
      );

      if (result.success) {
        let text = typeof result.data === "string"
          ? result.data
          : JSON.stringify(result.data, null, 2);

        if (result.logs?.length) {
          text = `## Console Output\n${
            result.logs.join("\n")
          }\n\n## Result\n${text}`;
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } else {
        const errorType = result.timedOut ? "TIMEOUT" : "RUNTIME ERROR";
        let text = `${errorType}: ${result.error}`;

        if (result.logs?.length) {
          text = `## Console Output\n${
            result.logs.join("\n")
          }\n\n## Error\n${text}`;
        }

        return {
          isError: true,
          content: [{ type: "text" as const, text }],
        };
      }
    },
  });
}
