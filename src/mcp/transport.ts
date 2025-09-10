/**
 * MCP Transport utilities for creating and connecting to different types of MCP servers
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpCommandConfig, McpRemoteConfig } from "./mod.ts";

/**
 * Connects to a CLI-based MCP server using stdio transport
 * @param client The MCP client instance
 * @param endpoint The server endpoint configuration
 * @param signal Optional abort signal for cancellation
 * @returns Promise that resolves when connected
 */
export async function connectToCliServer(
  client: Client,
  commandConfig: McpCommandConfig,
  signal?: AbortSignal,
): Promise<Transport> {
  const commonEnvVars = ["PATH", "HOME", "SHELL", "TERM"];
  const filteredEnvVars = {
    ...Object.fromEntries(
      commonEnvVars
        .map((key) => [key, Deno.env.get(key)])
        .filter(([_, value]) => value !== null),
    ),
    LANG: Deno.env.get("LANG") || "en_US.UTF-8",
  };

  const env = {
    ...filteredEnvVars,
    ...commandConfig.env,
  };

  console.log("CLI transport config", commandConfig);

  const transport = new StdioClientTransport({
    command: commandConfig.command,
    args: commandConfig.args,
    env,
  });

  await client.connect(transport, { signal });
  console.log(`Connected using CLI transport: ${commandConfig.command}`);

  return transport;
}

/**
 * Connects to a remote MCP server using HTTP transport
 * @param client The MCP client instance
 * @param endpoint The server endpoint configuration
 * @param signal Optional abort signal for cancellation
 * @returns Promise that resolves when connected
 */
export async function connectToRemoteServer(
  client: Client,
  remoteConfig: McpRemoteConfig,
  signal?: AbortSignal,
): Promise<Transport> {
  const mcpServerUrl = new URL(remoteConfig.url);

  console.log(`Connecting to remote MCP server: ${mcpServerUrl}`);

  const transport = new StreamableHTTPClientTransport(mcpServerUrl);

  // TODO: Implement OAuth retry mechanism here
  // For now, just attempt direct connection
  await client.connect(transport, { signal });
  console.log(`Connected using HTTP transport: ${mcpServerUrl}`);

  return transport;
}
