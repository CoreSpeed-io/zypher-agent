/**
 * ACP Server CLI Entry Point
 *
 * Starts an ACP-compatible server that can be used with editors like Zed.
 *
 * Usage:
 *   deno run -A jsr:@zypher/acp
 *
 * Environment variables:
 *   ZYPHER_MODEL - Model to use (default: gpt-4o-2024-11-20)
 *                  Provider is auto-detected from model name:
 *                  - claude*, sonnet*, haiku*, opus* → Anthropic
 *                  - Other models → OpenAI (OpenAI-compatible is de facto standard)
 *   OPENAI_API_KEY - API key for OpenAI (default provider)
 *   ANTHROPIC_API_KEY - API key for Anthropic (if using Anthropic models)
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
  createModel,
  createZypherAgent,
  DEFAULT_MODELS,
} from "@zypher/agent";
import { createFileSystemTools, RunTerminalCmdTool } from "@zypher/agent/tools";
import { type AcpClientConfig, runAcpServer } from "./server.ts";

export async function main(): Promise<void> {
  // Model is auto-detected from ZYPHER_MODEL env var, defaults to OpenAI's GPT-4o
  const modelId = Deno.env.get("ZYPHER_MODEL") ?? DEFAULT_MODELS.openai;
  const modelProvider = createModel(modelId);

  await runAcpServer(async (clientConfig: AcpClientConfig) => {
    return await createZypherAgent({
      model: modelProvider,
      tools: [...createFileSystemTools(), RunTerminalCmdTool],
      workingDirectory: clientConfig.cwd,
      mcpServers: clientConfig.mcpServers,
    });
  });
}
