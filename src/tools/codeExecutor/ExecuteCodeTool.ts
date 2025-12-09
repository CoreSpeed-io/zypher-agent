import z from "zod";
import type { McpServerManager } from "../../mcp/mod.ts";
import { AbortError } from "../../error.ts";
import { createTool, type ToolResult } from "../mod.ts";
import { executeCode } from "./executeCode.ts";

export interface ExecuteCodeToolOptions {
  timeout?: number;
}

export function createExecuteCodeTool(
  mcpServerManager: McpServerManager,
  options: ExecuteCodeToolOptions = {},
) {
  const { timeout = 600000 } = options;

  return createTool({
    name: "execute_code",
    description: `Execute TypeScript/JavaScript code with access to tools.

## Usage
Write the BODY of an async function. You have access to a \`tools\` object.

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
    schema: z.object({
      code: z.string().describe("The code to execute"),
    }),
    execute: async ({ code }): Promise<ToolResult> => {
      try {
        const result = await executeCode(code, mcpServerManager, {
          signal: AbortSignal.timeout(timeout),
        });

        const parts: string[] = [];

        if (result.logs.length > 0) {
          parts.push("## Console Output\n" + result.logs.join("\n"));
        }

        if (result.success) {
          if (result.data !== undefined) {
            const dataStr = typeof result.data === "string"
              ? result.data
              : JSON.stringify(result.data, null, 2);
            parts.push("## Result\n" + dataStr);
          }
        } else {
          const errorStr = result.error instanceof Error
            ? result.error.message
            : String(result.error);
          parts.push("## Error\n" + errorStr);
        }

        return {
          content: [{ type: "text", text: parts.join("\n\n") }],
          isError: !result.success,
        };
      } catch (error) {
        if (error instanceof AbortError) {
          return {
            content: [{
              type: "text",
              text: `Code execution timed out after ${timeout / 1000} seconds`,
            }],
            isError: true,
          };
        }
        throw error;
      }
    },
  });
}
