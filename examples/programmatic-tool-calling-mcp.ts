/**
 * Example: MCP Server Integration
 *
 * Demonstrates connecting to remote MCP servers using the Model Context Protocol.
 * This example uses DeepWiki, a free MCP server that provides access to
 * public GitHub repository documentation.
 *
 * DeepWiki Tools:
 * - read_wiki_structure: Get documentation topics for a repository
 * - read_wiki_contents: View documentation about a repository
 * - ask_question: Ask questions about a repository with AI-powered responses
 *
 * Run:
 *   deno run --unstable-worker-options -A examples/programmatic-tool-calling-mcp.ts
 */

import "@std/dotenv/load";
import {
  AnthropicModelProvider,
  createZypherAgent,
  runAgentInTerminal,
} from "@corespeed/zypher";
import { programmatic } from "@zypher/tools/codeExecution/programmatic/mod.ts";

const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.error("Error: Set ANTHROPIC_API_KEY environment variable");
  Deno.exit(1);
}

// Create agent with DeepWiki MCP server
const agent = await createZypherAgent({
  modelProvider: new AnthropicModelProvider({ apiKey }),
  mcpServers: [
    programmatic({
      id: "deepwiki",
      displayName: "DeepWiki",
      type: "remote",
      remote: {
        url: "https://mcp.deepwiki.com/mcp",
      },
    }),
  ],
});

console.log("MCP Tools:", Array.from(agent.mcp.tools.keys()).join(", "));
console.log(
  "\nTry: What is the architecture of facebook/react?",
);
console.log("Or: How does routing work in remix-run/remix?\n");

await runAgentInTerminal(agent, "claude-sonnet-4-20250514");
