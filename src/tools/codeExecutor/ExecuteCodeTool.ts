import z from "zod";
import type { McpServerManager } from "../../mcp/mod.ts";
import { AbortError, isAbortError } from "../../error.ts";
import { createTool, type Tool, type ToolResult } from "../mod.ts";
import { executeCode } from "./executeCode.ts";

/**
 * Configuration options for the execute_code tool.
 */
export interface ExecuteCodeToolOptions {
  /**
   * Maximum execution time in milliseconds before the code is terminated.
   * @default 600000 (10 minutes)
   */
  timeout?: number;
}

export function createExecuteCodeTool(
  mcpServerManager: McpServerManager,
  options: ExecuteCodeToolOptions = {},
): Tool {
  const { timeout = 600_000 } = options;

  return createTool({
    name: "execute_code",
    description:
      `Execute arbitrary TypeScript/JavaScript code in an isolated environment.

Use this tool for:
- Complex computations, data transformations, or algorithmic tasks
- Tasks requiring loops, conditionals, filtering, or aggregation
- Programmatic Tool Calling (PTC): orchestrating multiple tool calls in code

## Programmatic Tool Calling (PTC)

For tasks requiring many tool calls (loops, filtering, pre/post-processing), write code that orchestrates all operations in a single execution instead of calling tools one-by-one.

**Why PTC is better:**
- Loops and conditionals are handled in code, not by the LLM
- Multiple tool calls execute in one invocation—no back-and-forth inference cycles
- Intermediate results stay in code scope; only the final summary is returned
- Reduces context window usage and latency significantly

### Code Environment and Example

Your code runs as the body of an async function with access to a \`tools\` proxy object:

\`\`\`typescript
// Call any available tool directly
const result = await tools.toolName({ arg: value });

// Tools return ToolResult objects with this structure:
// {
//   content: [{ type: "text", text: "Human-readable output" }],
//   structuredContent?: { ... },  // If outputSchema is defined, this is required and strictly typed
// }

// When a tool has an outputSchema, use structuredContent for typed access
console.log(result.structuredContent.field);

// Example: Batch processing multiple files
const files = ["config.json", "settings.json", "data.json"];
const results = [];
for (const file of files) {
  try {
    const content = await tools.read_file({ path: file });
    results.push({ file, keys: Object.keys(content) });
  } catch (e) {
    results.push({ file, error: e.message });
  }
}
return results;
\`\`\`

## Guidelines
- Use console.log() for debugging (output is captured)
- Handle errors with try/catch when appropriate
- Timeout: ${timeout / 1000} seconds
`,
    schema: z.object({
      code: z.string().describe("The code to execute"),
    }),
    execute: async ({ code }): Promise<ToolResult> => {
      try {
        const result = await executeCode(code, mcpServerManager, {
          signal: AbortSignal.timeout(timeout),
        });

        const structuredContent = {
          data: result.data,
          error: result.error,
          logs: result.logs,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(structuredContent) }],
          structuredContent,
          isError: !result.success,
        };
      } catch (error) {
        if (isAbortError(error)) {
          throw new AbortError(
            `Code execution timed out after ${timeout / 1000} seconds`,
            { cause: error },
          );
        }
        throw error;
      }
    },
  });
}
