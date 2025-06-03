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
    return config.url;
  }
  throw new Error("OAuth is only supported for SSE-mode servers with URLs");
}

export function createOAuthRouter(mcpServerManager: McpServerManager) {
  const app = new Hono();

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

        // Try to get server configuration from saved OAuth data first
        const dataDir = await getWorkspaceDataDir();
        const oauthBaseDir = join(dataDir, "oauth", serverId);
        const serverInfoPath = join(oauthBaseDir, "server_info.json");

        let serverUrl: string;
        try {
          // Read server info from OAuth directory
          const serverInfoText = await Deno.readTextFile(serverInfoPath);
          const serverInfo = JSON.parse(serverInfoText);
          serverUrl = serverInfo.serverUrl;
        } catch {
          // Fallback to MCP server manager (for backward compatibility)
          let serverConfig: IMcpServerConfig;
          try {
            serverConfig = mcpServerManager.getServerConfig(serverId);
            serverUrl = getServerUrlFromConfig(serverConfig);
          } catch {
            return c.json({
              success: false,
              error:
                `Server not found: ${serverId}. OAuth data may be missing.`,
            }, 404);
          }
        }

        // Create OAuth provider for this server
        await ensureDir(oauthBaseDir);

        const oauthProvider = new RemoteOAuthProvider({
          serverId,
          serverUrl,
          oauthBaseDir,
          clientName: "zypher-agent-api",
        });

        console.log("Processing OAuth callback with data:", callbackData);
        const tokens = await oauthProvider.processCallback(callbackData);
        await oauthProvider.saveTokens(tokens);

        if (!tokens?.access_token) {
          throw new Error("Failed to obtain access token");
        }

        try {
          await mcpServerManager.deregisterServer(serverId);
        } catch {
          // Ignore errors - server might not exist
        }

        let serverConfig: IMcpServerConfig;
        try {
          const serverInfoText = await Deno.readTextFile(serverInfoPath);
          const serverInfo = JSON.parse(serverInfoText);
          serverConfig = serverInfo.serverConfig;
        } catch {
          serverConfig = {
            url: serverUrl,
            enabled: true,
          };
        }

        try {
          await mcpServerManager.registerServer(serverId, serverConfig);
          return c.json({
            success: true,
            message:
              "OAuth authentication completed and server registered successfully with OAuth credentials",
            registered: true,
          });
        } catch (registerError) {
          return c.json({
            success: true,
            message:
              "OAuth authentication completed successfully, but server registration failed. The OAuth tokens are saved and ready to use.",
            registered: false,
            serverUrl: serverUrl,
            registerError: registerError instanceof Error
              ? registerError.message
              : "Unknown error",
          });
        }
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
      const oauthBaseDir = join(dataDir, "oauth", serverId);
      await ensureDir(oauthBaseDir);

      const oauthProvider = new RemoteOAuthProvider({
        serverId,
        serverUrl,
        oauthBaseDir,
        clientName: "zypher-agent-api",
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
      const oauthBaseDir = join(dataDir, "oauth", serverId);
      await ensureDir(oauthBaseDir);

      const oauthProvider = new RemoteOAuthProvider({
        serverId,
        serverUrl,
        oauthBaseDir,
        clientName: "zypher-agent-api",
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
