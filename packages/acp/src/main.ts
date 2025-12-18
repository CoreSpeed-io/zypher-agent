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

import type * as acp from "acp";
import {
  AnthropicModelProvider,
  createZypherAgent,
  type McpServerEndpoint,
  type ModelProvider,
  OpenAIModelProvider,
} from "@zypher/agent";
import { createFileSystemTools, RunTerminalCmdTool } from "@zypher/agent/tools";
import { acpStdioServer } from "./server.ts";

/**
 * Converts ACP McpServer configurations to Zypher McpServerEndpoint format.
 */
function convertMcpServers(
  acpServers: acp.McpServer[],
): McpServerEndpoint[] {
  return acpServers.map((server): McpServerEndpoint => {
    if ("type" in server && (server.type === "http" || server.type === "sse")) {
      return {
        id: server.name,
        type: "remote",
        remote: {
          url: server.url,
          headers: Object.fromEntries(
            server.headers.map((h) => [h.name, h.value]),
          ),
        },
      };
    }

    const stdioServer = server as acp.McpServerStdio;
    return {
      id: stdioServer.name,
      type: "command",
      command: {
        command: stdioServer.command,
        args: stdioServer.args,
        env: Object.fromEntries(stdioServer.env.map((e) => [e.name, e.value])),
      },
    };
  });
}

export function main(): void {
  let modelProvider: ModelProvider;
  let defaultModel: string;

  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiApiKey) {
    modelProvider = new OpenAIModelProvider({ apiKey: openaiApiKey });
    defaultModel = "gpt-4o-2024-11-20";
  } else {
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (anthropicApiKey) {
      modelProvider = new AnthropicModelProvider({ apiKey: anthropicApiKey });
      defaultModel = "claude-sonnet-4-20250514";
    } else {
      console.error(
        "Error: Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable",
      );
      Deno.exit(1);
    }
  }

  const model = Deno.env.get("ZYPHER_MODEL") || defaultModel;

  const server = acpStdioServer(async (cwd, mcpServers) => {
    const convertedServers = mcpServers
      ? convertMcpServers(mcpServers)
      : undefined;

    const agent = await createZypherAgent({
      modelProvider,
      tools: [...createFileSystemTools(), RunTerminalCmdTool],
      workingDirectory: cwd,
      mcpServers: convertedServers,
    });

    return agent;
  }, model);

  server.start();
}
