/**
 * Example: MCP Store Registry
 *
 * Demonstrates listing and installing MCP servers from the CoreSpeed MCP Store
 * (corespeed.ai) using the Zypher Agent SDK.
 *
 * Run:
 *   deno run --env -A examples/mcp/mcp_store.ts
 */

import { createZypherAgent } from "@zypher/agent";
import { runAgentInTerminal } from "@zypher/cli";
import { TextLineStream } from "@std/streams";

async function prompt(message: string): Promise<string> {
  console.log(message);
  const lines = Deno.stdin.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());
  for await (const line of lines) {
    return line;
  }
  return "";
}

const agent = await createZypherAgent({
  model: "claude-sonnet-4-5-20250929",
  mcpServers: [
    // You can also install servers directly here by package identifier.
    // Browse available servers at https://corespeed.ai/servers
    // "@github/github-mcp-server",
  ],
});

// List available servers from the registry
const servers = await agent.mcp.listRegistryServers({ limit: 10 });

console.log("Available MCP servers:\n");
for (const [i, server] of servers.entries()) {
  console.log(
    `  ${i + 1}. ${server.displayName} - ${server.description ?? ""}`,
  );
}

// Let user choose a server to install
const choice = await prompt(
  "\nEnter server number to install (or press Enter to skip): ",
);
const index = parseInt(choice) - 1;

if (index >= 0 && index < servers.length) {
  const selected = servers[index];
  // Construct the package identifier in @scope/name format
  const packageId = `${selected.scope}/${selected.packageName}`;
  console.log(`\nInstalling ${packageId}...`);
  // Register the server from the registry — this resolves the package,
  // connects to the MCP server, and makes its tools available to the agent.
  await agent.mcp.registerServerFromRegistry(packageId);
  console.log(`Installed ${selected.displayName}\n`);
} else {
  console.log("\nSkipped server installation.\n");
}

await runAgentInTerminal(agent);
