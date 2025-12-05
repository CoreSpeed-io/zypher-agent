/**
 * Programmatic Tool Calling Module
 *
 * The `programmatic()` function takes any number of tools and returns a single
 * `execute_code` Tool. This tool is self-contained - it has the wrapped tools
 * embedded inside and doesn't need McpServerManager.
 *
 * @example
 * ```typescript
 * import { programmatic } from "@corespeed/zypher/tools";
 *
 * const agent = await createZypherAgent({
 *   modelProvider: new AnthropicModelProvider({ apiKey }),
 *   tools: [programmatic(WeatherTool, StockTool, { timeout: 30_000 })],
 * });
 * ```
 */

import type { Tool, ToolExecutionContext, ToolResult } from "../../mod.ts";
import type { CodeExecutionController, ToolDefinitions } from "./protocol.ts";
import { createController } from "../implementation/denowebworker/controller.ts";

// Re-export protocol types
export type {
  CallToolHandler,
  CodeExecutionController,
  CodeExecutionRequest,
  CodeExecutionResult,
  CodeExecutionRunner,
  ControllerMessage,
  RunnerMessage,
  ToolCallRequest,
  ToolCallResponse,
  ToolDefinition,
  ToolDefinitions,
} from "./protocol.ts";

export { generateCodeExecutionToolsPrompt } from "./prompt.ts";

export interface ProgrammaticOptions {
  /** Execution timeout in milliseconds. Default: 600000 (10 minutes) */
  timeout?: number;
  /** Custom CodeExecutionController. Default: DenoWebWorker implementation */
  controller?: CodeExecutionController;
}

export function programmatic(tool: Tool): Tool;
export function programmatic(...tools: Tool[]): Tool[];
export function programmatic(...args: Tool[]): Tool | Tool[] {
  const wrap = (t: Tool) => ({
    ...t,
    allowedCallers: ["programmatic"] as ["programmatic"],
  });

  return args.length === 1 ? wrap(args[0]) : args.map(wrap);
}

export function createExecuteCodeTool(tools: Tool[], timeout = 600_000): Tool {
  // Build tool definitions for the worker
  const toolDefinitions: ToolDefinitions = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  // Build a map of tool name to tool for execution
  const toolMap: Record<string, Tool> = {};
  for (const tool of tools) {
    toolMap[tool.name] = tool;
  }

  // Tool call handler - routes calls to wrapped tools
  const handleToolCall = async (
    toolName: string,
    args: unknown,
    ctx: ToolExecutionContext,
  ): Promise<unknown> => {
    if (!(toolName in toolMap)) {
      throw new Error(`Tool '${toolName}' not found`);
    }
    const tool = toolMap[toolName];
    const result = await tool.execute(
      (args as Record<string, unknown>) ?? {},
      ctx,
    );
    return result;
  };

  // Return the execute_code tool with wrapped tools embedded
  return {
    name: "execute_code",
    description: `Execute TypeScript code with access to tools.

## Usage
Write the BODY of an async function. You have access to a \`tools\` object.
Available tools are listed in the <code_execution> section of system prompt.

- Call tools: \`const result = await tools.toolName({ arg: value })\`
- Tools return **objects directly** (not JSON strings) - access properties directly like \`result.field\`
- Use console.log() for debugging (output is captured)
- RETURN the final result (will be JSON stringified)

## Example
\`\`\`typescript
const results = [];
for (const item of items) {
  const data = await tools.some_tool({ param: item });
  results.push({ item, value: data.field });
}
return results;
\`\`\`

## Guidelines
1. Return concise summaries, not raw data
2. Handle errors with try/catch if needed
3. Timeout: ${timeout / 1000} seconds
`,
    parameters: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description: "The TypeScript code body to execute.",
        },
      },
      required: ["code"],
    },
    allowedCallers: ["direct"],
    execute: async (
      params: { code: string },
      ctx: ToolExecutionContext,
    ): Promise<ToolResult> => {
      // Create controller for this execution
      const controller = createController(
        {
          timeout,
          onCallTool: (name, args) => handleToolCall(name, args, ctx),
        },
      );

      const result = await controller.execute(
        params.code,
        "typescript",
        toolDefinitions,
      );

      if (result.success) {
        let text = typeof result.data === "string"
          ? result.data
          : JSON.stringify(result.data, null, 2);

        if (result.logs?.length) {
          text = `## Console Output\n${
            result.logs.join(
              "\n",
            )
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
            result.logs.join(
              "\n",
            )
          }\n\n## Error\n${text}`;
        }

        return {
          isError: true,
          content: [{ type: "text" as const, text }],
        };
      }
    },
  };
}
