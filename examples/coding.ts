/**
 * Example: Coding Agent
 *
 * Demonstrates file system tools and error detection interceptors.
 * This example creates a coding assistant with:
 * - File tools: ReadFile, EditFile, CopyFile, DeleteFile, GrepSearch, ListDir
 * - Terminal command execution
 * - Error detection interceptors (TypeScript, ESLint)
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - (required) Your Anthropic API key
 *   ZYPHER_MODEL      - (optional) Model to use, defaults to "claude-sonnet-4-20250514"
 *
 * Run:
 *   deno run --env -A examples/coding.ts [workspace-path]
 *
 * Examples:
 *   deno run --env -A examples/coding.ts                    # Uses current directory
 *   deno run --env -A examples/coding.ts ./my-project       # Uses ./my-project
 */

import {
  createZypherAgent,
  errorDetector,
  getSystemPrompt,
} from "@zypher/agent";
import {
  CopyFileTool,
  createEditFileTools,
  DeleteFileTool,
  GrepSearchTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
} from "@zypher/agent/tools";
import { runAgentInTerminal } from "@zypher/cli";

const SYSTEM_PROMPT =
  `You are a coding assistant. Your job is to help the user with software development tasks, including:

1. Reading and understanding code
2. Writing new code and features
3. Debugging and fixing issues
4. Refactoring existing code
5. Running terminal commands

## Guidelines

### Code Modifications
- Always read files before modifying them to understand context
- Make targeted, minimal changes - avoid unnecessary refactoring
- Preserve existing code style and conventions
- Keep changes focused on the task at hand

### Code Quality
- Write clean, readable code with meaningful names
- Handle edge cases and errors appropriately
- Follow language-specific best practices
- Add comments only where the logic isn't self-evident

### Terminal Commands
- Use terminal commands when needed for builds, tests, or other operations
- Explain what commands will do before running them
- Check command output for errors

### Communication
- Explain your changes clearly
- Ask for clarification if requirements are ambiguous
- Report any issues or blockers you encounter`;

// Get workspace from CLI args or use current directory
const workspace = Deno.args[0] ?? Deno.cwd();

// Change to workspace directory
if (workspace !== Deno.cwd()) {
  Deno.chdir(workspace);
  console.log(`Working directory: ${Deno.cwd()}\n`);
}

const model = Deno.env.get("ZYPHER_MODEL") ?? "claude-sonnet-4-20250514";

console.log(`Using model: ${model}`);
console.log(`Workspace: ${Deno.cwd()}\n`);

// Create edit file tools (includes EditFileTool and WriteFileTool)
const editTools = createEditFileTools();

const agent = await createZypherAgent({
  model,
  overrides: {
    systemPromptLoader: () =>
      getSystemPrompt(Deno.cwd(), { customInstructions: SYSTEM_PROMPT }),
  },
  tools: [
    ReadFileTool,
    ...editTools,
    CopyFileTool,
    DeleteFileTool,
    GrepSearchTool,
    ListDirTool,
    RunTerminalCmdTool,
  ],
  interceptors: [
    // Run TypeScript type checking after each response
    errorDetector("deno", ["check", "."]),
    // Run linting after each response
    errorDetector("deno", ["lint"]),
  ],
});

await runAgentInTerminal(agent);
