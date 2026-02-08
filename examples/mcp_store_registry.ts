/**
 * Example: MCP Store Registry
 *
 * Demonstrates listing and installing MCP servers from the CoreSpeed MCP Store
 * (api.corespeed.ai) using the Zypher Agent SDK.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - (required) Your Anthropic API key
 *
 * Run:
 *   deno run --env -A examples/mcp_store_registry.ts
 */

import {
  createZypherAgent,
  createZypherContext,
  McpServerManager,
} from "@zypher/agent";
import { runAgentInTerminal } from "@zypher/cli";

// --- 1. List available servers from the registry ---

const context = await createZypherContext(Deno.cwd());
const manager = new McpServerManager(context);

console.log("Fetching servers from MCP Store registry...\n");

const servers = await manager.listRegistryServers({ limit: 5 });
for (const server of servers) {
  console.log(`  - ${server.displayName} (${server.scope}/${server.packageName})`);
}

await manager.dispose();

// --- 2. Create an agent with an MCP server installed by package identifier ---

console.log("\nCreating agent with @anthropic/brave-search...\n");

const agent = await createZypherAgent({
  model: "claude-sonnet-4-5-20250929",
  mcpServers: ["@anthropic/brave-search"],
});

await runAgentInTerminal(agent);
