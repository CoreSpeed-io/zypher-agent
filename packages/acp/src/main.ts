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

  const logFile = "/tmp/zypher-acp-debug.log";
  const log = (msg: string) => {
    const timestamp = new Date().toISOString();
    Deno.writeTextFileSync(logFile, `[${timestamp}] ${msg}\n`, {
      append: true,
    });
  };

  log("=== ACP Server Started ===");

  const server = acpStdioServer(async (cwd, mcpServers) => {
    log(
      `Creating agent with MCP servers: ${JSON.stringify(mcpServers, null, 2)}`,
    );
    const convertedServers = mcpServers
      ? convertMcpServers(mcpServers)
      : undefined;
    log(`Converted MCP servers: ${JSON.stringify(convertedServers, null, 2)}`);

    try {
      const agent = await createZypherAgent({
        modelProvider,
        tools: [...createFileSystemTools(), RunTerminalCmdTool],
        workingDirectory: cwd,
        mcpServers: convertedServers,
      });

      // Debug: Log registered tools
      log(`Registered tools: ${Array.from(agent.mcp.tools.keys()).join(", ")}`);
      log(`MCP servers registered: ${agent.mcp.servers.size}`);
      for (const [id, info] of agent.mcp.servers) {
        log(
          `  Server ${id}: connected=${info.client.connected}, toolCount=${info.client.toolCount}`,
        );
        if (info.client.toolCount > 0) {
          log(`    Tools: ${info.client.tools.map((t) => t.name).join(", ")}`);
        }
      }

      return agent;
    } catch (error) {
      log(`ERROR creating agent: ${error}`);
      throw error;
    }
  });

  server.start();
}
