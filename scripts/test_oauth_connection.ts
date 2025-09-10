/**
 * Interactive OAuth Connection Test Script
 *
 * This script tests OAuth-enabled MCP server connections with manual user interaction.
 * It guides you through the complete OAuth flow:
 * 1. Prints an authorization URL for you to visit
 * 2. You authorize the application in your browser
 * 3. You copy and paste the callback URL back into the script
 * 4. Script completes OAuth flow and connects to the MCP server
 * 5. Displays server capabilities (tools, resources, prompts)
 *
 * Usage:
 *   deno run --allow-all test_oauth_connection.ts <server-url>
 *
 * Examples:
 *   deno run --allow-all test_oauth_connection.ts https://your-mcp-server.com/mcp
 *   deno run --allow-all test_oauth_connection.ts http://localhost:8080/mcp
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  connectToRemoteServer,
  InMemoryOAuthProvider,
  type McpRemoteConfig,
  type OAuthCallbackHandler,
} from "@zypher/mcp/mod.ts";

function printUsage() {
  console.log(
    "Usage: deno run --allow-all test_oauth_connection.ts <server-url>",
  );
  console.log("");
  console.log("Examples:");
  console.log(
    "  deno run --allow-all test_oauth_connection.ts https://your-mcp-server.com/mcp",
  );
  console.log(
    "  deno run --allow-all test_oauth_connection.ts http://localhost:8080/mcp",
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

  console.log("🔗 MCP OAuth Connection Test");
  console.log("============================");
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
        client_name: "ZypherAgent OAuth Test Client",
        client_uri: "https://github.com/CoreSpeed-io/zypher-agent",
        software_id: "zypher-agent-oauth-test-client",
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
      name: "zypher-agent-oauth-test-client",
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
    console.log("✨ OAuth connection test completed successfully!");
  } catch (error) {
    console.error("");
    console.error("❌ OAuth connection test failed:", error);
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

/**
 * Simple CLI-based OAuth callback handler for testing
 * Handles waiting for user to complete OAuth flow and provide authorization code
 */
class CliOAuthCallbackHandler implements OAuthCallbackHandler {
  waitForCallback(): Promise<string> {
    const input = prompt("After authorization, paste the callback URL here: ");

    if (!input?.trim()) {
      throw new Error("No callback URL provided");
    }

    // Parse the callback URL to extract authorization code
    let callbackUrl: URL;
    try {
      callbackUrl = new URL(input.trim());
    } catch {
      throw new Error("Invalid callback URL format");
    }

    const code = callbackUrl.searchParams.get("code");
    const error = callbackUrl.searchParams.get("error");
    if (code) {
      return Promise.resolve(code);
    } else if (error) {
      throw new Error(`OAuth authorization failed: ${error}`);
    } else {
      throw new Error("No authorization code or error found in callback URL");
    }
  }
}

if (import.meta.main) {
  await main();
}
