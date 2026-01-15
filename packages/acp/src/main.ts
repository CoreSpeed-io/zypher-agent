/**
 * ACP Server CLI Entry Point
 *
 * Starts an ACP-compatible server that can be used with editors like Zed.
 *
 * Usage:
 *   deno run -A jsr:@zypher/acp
 *
 * Environment variables:
 *   ZYPHER_MODEL - Model to use (provider auto-detected from model name)
 *   OPENAI_API_KEY - API key for OpenAI
 *   ANTHROPIC_API_KEY - API key for Anthropic
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
  createModelProvider,
  createZypherAgent,
  DEFAULT_MODELS,
} from "@zypher/agent";
import { createFileSystemTools, RunTerminalCmdTool } from "@zypher/agent/tools";
import { type AcpClientConfig, runAcpServer } from "./server.ts";

export async function main(): Promise<void> {
  const modelId = Deno.env.get("ZYPHER_MODEL") ?? DEFAULT_MODELS.openai;
  const modelProvider = createModelProvider(modelId);

  await runAcpServer(async (clientConfig: AcpClientConfig) => {
    return await createZypherAgent({
      model: modelProvider,
      tools: [...createFileSystemTools(), RunTerminalCmdTool],
      workingDirectory: clientConfig.cwd,
      mcpServers: clientConfig.mcpServers,
    });
  });
}
