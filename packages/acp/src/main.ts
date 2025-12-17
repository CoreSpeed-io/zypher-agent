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
 *   ZYPHER_MODEL - Override the default model
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
import { acpStdioServer } from "./server.ts";

export function main(): void {
  let modelProvider: ModelProvider;

  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiApiKey) {
    modelProvider = new OpenAIModelProvider({ apiKey: openaiApiKey });
    if (!Deno.env.get("ZYPHER_MODEL")) {
      Deno.env.set("ZYPHER_MODEL", "gpt-4o-2024-11-20");
    }
  } else {
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (anthropicApiKey) {
      modelProvider = new AnthropicModelProvider({ apiKey: anthropicApiKey });
      if (!Deno.env.get("ZYPHER_MODEL")) {
        Deno.env.set("ZYPHER_MODEL", "claude-sonnet-4-20250514");
      }
    } else {
      console.error(
        "Error: Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable",
      );
      Deno.exit(1);
    }
  }

  const server = acpStdioServer(async (cwd) => {
    return await createZypherAgent({
      modelProvider,
      tools: [...createFileSystemTools(), RunTerminalCmdTool],
      workingDirectory: cwd,
    });
  });

  server.start();
}
