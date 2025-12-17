/**
 * Low-Level OAuth Connection Example
 *
 * This example demonstrates how to use the low-level `connectToRemoteServer` API
 * to connect to OAuth-enabled MCP servers. This function accepts a `Client` instance
 * from the MCP SDK and handles connection logic, transport fallback, and OAuth flow.
 *
 * NOTE: For most use cases, prefer the high-level `McpClient` API which wraps the
 * MCP SDK's `Client` with a state machine that manages connection lifecycle, OAuth,
 * reconnection, and exposes a simple `desiredEnabled` API for control.
 * See the `McpClient.example.ts` example for the recommended approach.
 *
 * The OAuth flow in this example:
 * 1. Prints an authorization URL for you to visit
 * 2. You authorize the application in your browser
 * 3. You copy and paste the callback URL back
 * 4. Script completes OAuth flow and connects to the MCP server
 * 5. Displays server capabilities (tools, resources, prompts)
 *
 * Usage:
 *   deno run --allow-all connectToRemoteServer.example.ts <server-url>
 *
 * Examples:
 *   deno run --allow-all connectToRemoteServer.example.ts https://your-mcp-server.com/mcp
 *   deno run --allow-all connectToRemoteServer.example.ts http://localhost:8080/mcp
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  connectToRemoteServer,
  InMemoryOAuthProvider,
  type McpRemoteConfig,
} from "@zypher/agent";
import { CliOAuthCallbackHandler } from "@zypher/cli";

function printUsage() {
  console.log(
    "Usage: deno run --allow-all connectToRemoteServer.example.ts <server-url>",
  );
  console.log("");
  console.log("Examples:");
  console.log(
    "  deno run --allow-all connectToRemoteServer.example.ts https://your-mcp-server.com/mcp",
  );
  console.log(
    "  deno run --allow-all connectToRemoteServer.example.ts http://localhost:8080/mcp",
  );
  console.log("");
  console.log(
    "This script will guide you through the OAuth authorization process.",
  );
}

async function main() {
  const args = Deno.args;

  if (args.length !== 1) {
    console.error("❌ Error: Server URL is required");
    console.log("");
    printUsage();
    Deno.exit(1);
  }

  const serverUrl = args[0];

  // Validate URL
  try {
    new URL(serverUrl);
  } catch {
    console.error("❌ Error: Invalid server URL");
    console.log("");
    printUsage();
    Deno.exit(1);
  }

  console.log("🔗 MCP OAuth Connection Example");
  console.log("================================");
  console.log(`Server URL: ${serverUrl}`);
  console.log("");

  let client: Client | null = null;

  try {
    // Create OAuth provider with console-based redirect handling
    const oauthProvider = new InMemoryOAuthProvider({
      clientMetadata: {
        redirect_uris: ["http://localhost:8080/mcp/oauth/callback"],
        token_endpoint_auth_method: "client_secret_post",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_name: "MCP OAuth Example Client",
        client_uri: "https://github.com/anthropics/zypher-agent",
        software_id: "zypher-mcp-oauth-example",
        software_version: "1.0.0",
      },
      onRedirect: (authorizationUrl: string) => {
        console.log("\n🌐 AUTHORIZATION REQUIRED");
        console.log("========================");
        console.log("Please visit this URL to authorize the application:");
        console.log("");
        console.log(`   ${authorizationUrl}`);
        console.log("");
      },
    });
    const callbackHandler = new CliOAuthCallbackHandler();

    // Create client
    client = new Client({
      name: "mcp-oauth-example-client",
      version: "1.0.0",
    });

    const remoteConfig: McpRemoteConfig = {
      url: serverUrl,
    };

    // Start the connection process (this will trigger OAuth flow)
    await connectToRemoteServer(client, remoteConfig, {
      oauth: {
        authProvider: oauthProvider,
        callbackHandler: callbackHandler,
      },
    });

    console.log("🎉 Connected to MCP server successfully!");
    console.log("");

    // Test server capabilities
    console.log("📊 Server Capabilities");
    console.log("======================");

    // List available tools
    try {
      const toolResult = await client.listTools();
      console.log(`🔧 Tools (${toolResult.tools.length}):`);
      if (toolResult.tools.length === 0) {
        console.log("   No tools available");
      } else {
        toolResult.tools.forEach((tool, index) => {
          console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
        });
      }
    } catch (error) {
      console.log(
        "🔧 Tools: Error listing tools -",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    console.log("");

    // List available resources
    try {
      const resourceResult = await client.listResources();
      console.log(`📁 Resources (${resourceResult.resources.length}):`);
      if (resourceResult.resources.length === 0) {
        console.log("   No resources available");
      } else {
        resourceResult.resources.forEach((resource, index) => {
          console.log(
            `   ${index + 1}. ${resource.name} - ${
              resource.description || "No description"
            }`,
          );
        });
      }
    } catch (_error) {
      console.log("📁 Resources: Not supported or none available");
    }

    console.log("");

    // List available prompts
    try {
      const promptResult = await client.listPrompts();
      console.log(`💬 Prompts (${promptResult.prompts.length}):`);
      if (promptResult.prompts.length === 0) {
        console.log("   No prompts available");
      } else {
        promptResult.prompts.forEach((prompt, index) => {
          console.log(
            `   ${index + 1}. ${prompt.name} - ${
              prompt.description || "No description"
            }`,
          );
        });
      }
    } catch (_error) {
      console.log("💬 Prompts: Not supported or none available");
    }

    console.log("");
    console.log("✨ OAuth connection example completed successfully!");
  } catch (error) {
    console.error("");
    console.error("❌ OAuth connection failed:", error);
    Deno.exit(1);
  } finally {
    // Clean up
    if (client) {
      try {
        await client.close();
      } catch (_error) {
        // Ignore cleanup errors
      }
    }
  }
}

if (import.meta.main) {
  await main();
}
