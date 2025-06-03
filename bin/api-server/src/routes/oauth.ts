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

async function createOAuthProvider(
  serverId: string,
  mcpServerManager: McpServerManager,
) {
  const serverConfig = mcpServerManager.getServerConfig(serverId);
  const serverUrl = getServerUrlFromConfig(serverConfig);

  const dataDir = await getWorkspaceDataDir();
  const oauthBaseDir = join(dataDir, "oauth", serverId);
  await ensureDir(oauthBaseDir);

  return new RemoteOAuthProvider({
    serverId,
    serverUrl,
    oauthBaseDir,
    clientName: "zypher-agent-api",
  });
}

async function getServerUrlForOAuth(
  serverId: string,
  mcpServerManager: McpServerManager,
): Promise<string> {
  const dataDir = await getWorkspaceDataDir();
  const serverInfoPath = join(dataDir, "oauth", serverId, "server_info.json");

  try {
    const serverInfoText = await Deno.readTextFile(serverInfoPath);
    const serverInfo = JSON.parse(serverInfoText);
    return serverInfo.serverUrl;
  } catch {
    const serverConfig = mcpServerManager.getServerConfig(serverId);
    return getServerUrlFromConfig(serverConfig);
  }
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
      const serverId = c.req.param("serverId");
      const callbackData = c.req.valid("json");

      const oauthProvider = await createOAuthProvider(
        serverId,
        mcpServerManager,
      );

      const tokens = await oauthProvider.processCallback(callbackData);
      await oauthProvider.saveTokens(tokens);

      if (!tokens?.access_token) {
        throw new Error("Failed to obtain access token");
      }

      await mcpServerManager.deregisterServer(serverId);

      const serverConfig = {
        url: await getServerUrlForOAuth(serverId, mcpServerManager),
        enabled: true,
      };

      await mcpServerManager.registerServer(serverId, serverConfig);
      return c.json({
        success: true,
        message:
          "OAuth authentication completed and server registered successfully with OAuth credentials",
        registered: true,
      });
    },
  );

  /**
   * Clear OAuth data for a server
   * DELETE /oauth/:serverId
   */
  app.delete("/:serverId", async (c) => {
    const serverId = c.req.param("serverId");

    const oauthProvider = await createOAuthProvider(serverId, mcpServerManager);

    await oauthProvider.clearAuthData();

    return c.json({
      success: true,
      message: "OAuth data cleared successfully",
    });
  });

  /**
   * Get OAuth status for a server
   * GET /oauth/:serverId/status
   */
  app.get("/:serverId/status", async (c) => {
    const serverId = c.req.param("serverId");

    const oauthProvider = await createOAuthProvider(serverId, mcpServerManager);

    const tokens = await oauthProvider.tokens();
    const hasValidTokens = !!(tokens?.access_token);

    return c.json({
      success: true,
      authenticated: hasValidTokens,
      hasTokens: hasValidTokens,
    });
  });

  return app;
}
