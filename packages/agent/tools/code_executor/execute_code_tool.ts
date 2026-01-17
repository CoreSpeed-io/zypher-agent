import { createAbortError, isAbortError } from "@zypher/utils";
import z from "zod";
import type { McpServerManager } from "../../mcp/mod.ts";
import { createTool, type Tool, type ToolResult } from "../mod.ts";
import { executeCode } from "./execute_code.ts";

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
- Intermediate results stay in code scope; only the final answer is returned
- Reduces context window usage and latency significantly

### Code Environment
Your code runs as the body of an async function. Write code directly—do NOT wrap it in a function. You have access to a \`tools\` proxy object to call any available tool.

\`\`\`typescript
// Your code is executed like this internally:
// async function execute(tools) {
//   <YOUR CODE HERE>
// }

// ❌ WRONG - don't define your own function:
async function main() { ... }

// ✅ CORRECT - write code directly:
const result = await tools.someApi({ param: "value" });
return result;
\`\`\`

### Tool Results
Tools return ToolResult objects:
\`\`\`typescript
// {
//   content: [{ type: "text", text: "Human-readable output" }],
//   structuredContent?: { ... },  // Optional, but if outputSchema is defined, this is required and strictly typed
// }
\`\`\`

**Tip:** If a tool doesn't have outputSchema defined, inspect its result structure first before writing complex logic:
\`\`\`typescript
const sample = await tools.some_tool({ param: "value" });
return sample; // Examine the output, then write proper code in next execution
\`\`\`

### Example
\`\`\`typescript
// Find the largest file (only return what's asked, not all file sizes)
const files = ["config.json", "settings.json", "data.json"];
let largest = { file: "", size: 0 };
for (const file of files) {
  const stat = await tools.stat_file({ path: file });
  if (stat.structuredContent.size > largest.size) {
    largest = { file, size: stat.structuredContent.size };
  }
}
// Return the answer the user asked for, not all intermediate file stats
return largest;
\`\`\`

## Guidelines
- **IMPORTANT:** When a task involves tools that may return large datasets (e.g., listing all items, fetching many records), use execute_code from the START. Call the data-fetching tool inside your code so the large response stays in code scope and doesn't consume context window. Never call such tools directly first—always wrap them in execute_code.
- **Keep return values concise.** Avoid returning all intermediate data (e.g., all items fetched in a loop). Include important details when necessary, but focus on the specific answer the user asked for.
- Use console.log() for debugging (output is captured), but avoid excessive logging as it adds to context
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
          throw createAbortError(
            `Code execution timed out after ${timeout / 1000} seconds`,
          );
        }
        throw error;
      }
    },
  });
}
