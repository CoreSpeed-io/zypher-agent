/**
 * ACP Server CLI Entry Point
 *
 * Starts an ACP-compatible server that can be used with editors like Zed.
 *
 * Usage:
 *   deno run -A jsr:@zypher/acp
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - Required: Your Anthropic API key
 *   ZYPHER_MODEL - Optional: Model to use (default: claude-sonnet-4-20250514)
 *
 * Zed configuration example:
 * {
 *   "agent": {
 *     "profiles": {
 *       "zypher": {
 *         "type": "custom",
 *         "command": "deno",
 *         "args": ["run", "-A", "jsr:@zypher/acp"],
 *         "env": {
 *           "ANTHROPIC_API_KEY": "your-api-key"
 *         }
 *       }
 *     }
 *   }
 * }
 */

import { AnthropicModelProvider, createZypherAgent } from "@zypher/agent";
import { createFileSystemTools, RunTerminalCmdTool } from "@zypher/agent/tools";
import { acpStdioServer } from "./server.ts";

export function main(): void {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required");
    Deno.exit(1);
  }

  const modelProvider = new AnthropicModelProvider({ apiKey });

  const server = acpStdioServer(async (cwd) => {
    return await createZypherAgent({
      modelProvider,
      tools: [...createFileSystemTools(), RunTerminalCmdTool],
      workingDirectory: cwd,
    });
  });

  server.start();
}
