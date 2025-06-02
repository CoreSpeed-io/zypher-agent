/**
 * OAuth Routes for API Server
 *
 * Handles OAuth flows for MCP servers:
 * - GET /oauth/callback - Handle OAuth callbacks from providers
 * - POST /oauth/:serverId/callback - Process callback data from frontend
 * - DELETE /oauth/:serverId - Clear OAuth data for a server
 * - GET /oauth/:serverId/status - Check OAuth status
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { McpServerManager } from "../../../../src/mcp/McpServerManager.ts";
import type { IMcpServerConfig } from "../../../../src/mcp/types.ts";
import { RemoteOAuthProvider } from "../auth/RemoteOAuthProvider.ts";
import { getWorkspaceDataDir } from "../../../../src/utils/mod.ts";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";

// Validation schemas
const CallbackDataSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

/**
 * Extract server URL from MCP server config
 */
function getServerUrlFromConfig(config: IMcpServerConfig): string {
  if ("url" in config) {
    // SSE config
    return config.url;
  }
  // CLI config - we don't have a URL, so this is likely not an OAuth-enabled server
  throw new Error("OAuth is only supported for SSE-mode servers with URLs");
}

export function createOAuthRouter(mcpServerManager: McpServerManager) {
  const app = new Hono();

  /**
   * Handle OAuth callback from provider (direct redirect)
   * GET /oauth/callback
   */
  app.get("/callback", (c) => {
    const url = new URL(c.req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    // Return a simple HTML page that posts the data to the frontend
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>OAuth Authentication</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin: 0;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 30px;
            max-width: 500px;
            margin: 0 auto;
            backdrop-filter: blur(10px);
        }
        .success { color: #4ade80; }
        .error { color: #f87171; }
        .code { 
            background: rgba(0, 0, 0, 0.2); 
            padding: 10px; 
            border-radius: 5px; 
            font-family: monospace;
            word-break: break-all;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="${error ? "error" : "success"}">
            ${error ? "❌ Authentication Failed" : "✅ Authentication Complete"}
        </h1>
        ${
      error
        ? `<p>Error: ${error}</p>
           ${errorDescription ? `<p>Description: ${errorDescription}</p>` : ""}`
        : `<p>Authorization successful! You can close this window.</p>
           <div class="code">Authorization Code: ${
          code?.substring(0, 20)
        }...</div>`
    }
        <p>
            <small>This callback data has been processed by the API server.</small>
        </p>
    </div>

    <script>
        // Send callback data to parent window if it exists (for popup flows)
        if (window.opener) {
            window.opener.postMessage({
                type: 'oauth_callback',
                data: {
                    code: '${code || ""}',
                    state: '${state || ""}',
                    error: '${error || ""}',
                    error_description: '${errorDescription || ""}'
                }
            }, '*');
            window.close();
        }
    </script>
</body>
</html>`;

    return c.html(html);
  });

  /**
   * Process OAuth callback data from frontend
   * POST /oauth/:serverId/callback
   */
  app.post(
    "/:serverId/callback",
    zValidator("json", CallbackDataSchema),
    async (c) => {
      try {
        const serverId = c.req.param("serverId");
        const callbackData = c.req.valid("json");

        console.log(`Processing OAuth callback for server: ${serverId}`);

        // Get server configuration from MCP server manager
        let serverConfig: IMcpServerConfig;
        try {
          serverConfig = mcpServerManager.getServerConfig(serverId);
        } catch {
          return c.json({
            success: false,
            error: `Server not found: ${serverId}`,
          }, 404);
        }

        // Extract server URL from config
        let serverUrl: string;
        try {
          serverUrl = getServerUrlFromConfig(serverConfig);
        } catch (error) {
          return c.json({
            success: false,
            error: error instanceof Error
              ? error.message
              : "Invalid server configuration",
          }, 400);
        }

        // Create OAuth provider for this server
        const dataDir = await getWorkspaceDataDir();
        const oauthBaseDir = join(dataDir, "oauth");
        await ensureDir(oauthBaseDir);

        const oauthProvider = new RemoteOAuthProvider({
          serverUrl,
          oauthBaseDir,
          clientName: "zypher-agent-api",
          softwareVersion: "1.0.0",
        });

        // Process the callback
        await oauthProvider.processCallback(callbackData);

        // Verify we have tokens
        const tokens = await oauthProvider.tokens();
        if (!tokens?.access_token) {
          throw new Error("Failed to obtain access token");
        }

        return c.json({
          success: true,
          message: "OAuth authentication completed successfully",
        });
      } catch (error) {
        console.error(
          `OAuth callback processing failed for ${c.req.param("serverId")}:`,
          error,
        );
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }, 500);
      }
    },
  );

  /**
   * Clear OAuth data for a server
   * DELETE /oauth/:serverId
   */
  app.delete("/:serverId", async (c) => {
    try {
      const serverId = c.req.param("serverId");

      console.log(`Clearing OAuth data for server: ${serverId}`);

      // Get server configuration from MCP server manager
      let serverConfig: IMcpServerConfig;
      try {
        serverConfig = mcpServerManager.getServerConfig(serverId);
      } catch {
        return c.json({
          success: false,
          error: `Server not found: ${serverId}`,
        }, 404);
      }

      // Extract server URL from config
      let serverUrl: string;
      try {
        serverUrl = getServerUrlFromConfig(serverConfig);
      } catch (error) {
        return c.json({
          success: false,
          error: error instanceof Error
            ? error.message
            : "Invalid server configuration",
        }, 400);
      }

      // Create OAuth provider for this server
      const dataDir = await getWorkspaceDataDir();
      const oauthBaseDir = join(dataDir, "oauth");
      await ensureDir(oauthBaseDir);

      const oauthProvider = new RemoteOAuthProvider({
        serverUrl,
        oauthBaseDir,
        clientName: "zypher-agent-api",
        softwareVersion: "1.0.0",
      });

      await oauthProvider.clearAuthData();

      return c.json({
        success: true,
        message: "OAuth data cleared successfully",
      });
    } catch (error) {
      console.error(
        `Failed to clear OAuth data for ${c.req.param("serverId")}:`,
        error,
      );
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }, 500);
    }
  });

  /**
   * Get OAuth status for a server
   * GET /oauth/:serverId/status
   */
  app.get("/:serverId/status", async (c) => {
    try {
      const serverId = c.req.param("serverId");

      // Get server configuration from MCP server manager
      let serverConfig: IMcpServerConfig;
      try {
        serverConfig = mcpServerManager.getServerConfig(serverId);
      } catch {
        return c.json({
          success: false,
          error: `Server not found: ${serverId}`,
        }, 404);
      }

      // Extract server URL from config
      let serverUrl: string;
      try {
        serverUrl = getServerUrlFromConfig(serverConfig);
      } catch (error) {
        return c.json({
          success: false,
          error: error instanceof Error
            ? error.message
            : "Invalid server configuration",
          authenticated: false,
          hasTokens: false,
        }, 400);
      }

      // Create OAuth provider for this server
      const dataDir = await getWorkspaceDataDir();
      const oauthBaseDir = join(dataDir, "oauth");
      await ensureDir(oauthBaseDir);

      const oauthProvider = new RemoteOAuthProvider({
        serverUrl,
        oauthBaseDir,
        clientName: "zypher-agent-api",
        softwareVersion: "1.0.0",
      });

      const tokens = await oauthProvider.tokens();
      const hasValidTokens = !!(tokens?.access_token);

      return c.json({
        success: true,
        authenticated: hasValidTokens,
        hasTokens: hasValidTokens,
      });
    } catch (error) {
      console.error(
        `Failed to get OAuth status for ${c.req.param("serverId")}:`,
        error,
      );
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        authenticated: false,
        hasTokens: false,
      }, 500);
    }
  });

  return app;
}
