/**
 * ACP Server CLI Entry Point
 *
 * Starts an ACP-compatible server that can be used with editors like Zed.
 *
 * Usage:
 *   deno run -A jsr:@zypher/acp
 *
 * Environment variables (checked in order):
 *   OPENAI_API_KEY - Use OpenAI as the model provider (default model: gpt-4o-2024-11-20)
 *   ANTHROPIC_API_KEY - Use Anthropic as the model provider (default model: claude-sonnet-4-20250514)
 *   ZYPHER_MODEL - Optional: override the default model
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
 *           "OPENAI_API_KEY": "your-api-key"
 *         }
 *       }
 *     }
 *   }
 * }
 */

import {
  AnthropicModelProvider,
  createZypherAgent,
  type ModelProvider,
  OpenAIModelProvider,
} from "@zypher/agent";
import { createFileSystemTools, RunTerminalCmdTool } from "@zypher/agent/tools";
import { runAcpServer } from "./server.ts";

function extractModelProvider(): { provider: ModelProvider; model: string } {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    return {
      provider: new OpenAIModelProvider({ apiKey: openaiKey }),
      model: Deno.env.get("ZYPHER_MODEL") || "gpt-4o-2024-11-20",
    };
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    return {
      provider: new AnthropicModelProvider({ apiKey: anthropicKey }),
      model: Deno.env.get("ZYPHER_MODEL") || "claude-sonnet-4-20250514",
    };
  }

  console.error(
    "Error: Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable",
  );
  Deno.exit(1);
}

export async function main(): Promise<void> {
  const { provider: modelProvider, model } = extractModelProvider();

  await runAcpServer(async (clientConfig) => {
    return await createZypherAgent({
      modelProvider,
      tools: [...createFileSystemTools(), RunTerminalCmdTool],
      workingDirectory: clientConfig.cwd,
      mcpServers: clientConfig.mcpServers,
    });
  }, model);
}
