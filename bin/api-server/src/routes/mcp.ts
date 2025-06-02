import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  McpServerError,
  type McpServerManager,
} from "../../../../src/mcp/McpServerManager.ts";
import {
  McpServerConfigSchema,
  McpServerIdSchema,
} from "../../../../src/mcp/types.ts";
import { z } from "zod";
import { ApiError } from "../error.ts";
import { RemoteOAuthProvider } from "../auth/RemoteOAuthProvider.ts";
import { getWorkspaceDataDir } from "../../../../src/utils/mod.ts";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";

// Schema for request validation
const McpServerApiSchema = z.record(z.string(), McpServerConfigSchema);

export function createMcpRouter(mcpServerManager: McpServerManager): Hono {
  const mcpRouter = new Hono();

  // List registered MCP servers
  mcpRouter.get("/servers", (c) => {
    const servers = mcpServerManager.getAllServerWithTools();
    return c.json({ servers });
  });

  // Update server status
  mcpRouter.put(
    "/servers/:id/status",
    zValidator("json", z.object({ enabled: z.boolean() })),
    async (c) => {
      const id = McpServerIdSchema.parse(c.req.param("id"));
      const { enabled } = c.req.valid("json");
      await mcpServerManager.setServerStatus(id, enabled);
      return c.body(null, 204);
    },
  );

  // Register new MCP server
  mcpRouter.post(
    "/register",
    zValidator("json", McpServerApiSchema),
    async (c) => {
      const servers = c.req.valid("json");
      try {
        await Promise.all(
          Object.entries(servers).map(
            ([name, config]) =>
              config && mcpServerManager.registerServer(name, config),
          ),
        );
      } catch (error) {
        if (error instanceof McpServerError) {
          if (error.code === "already_exists") {
            throw new ApiError(409, error.code, error.message, error.details);
          }
          if (error.code === "oauth_required") {
            // Generate OAuth URL directly and return it in the response
            try {
              const details = error.details as {
                serverId: string;
                serverUrl: string;
              };
              const serverUrl = details.serverUrl;
              const serverConfig = servers[details.serverId];

              // Create OAuth provider for this server
              const dataDir = await getWorkspaceDataDir();
              const oauthBaseDir = join(dataDir, "oauth", details.serverId);
              await ensureDir(oauthBaseDir);

              const oauthProvider = new RemoteOAuthProvider({
                serverId: details.serverId,
                serverUrl,
                oauthBaseDir,
                clientName: "zypher-agent-api",
              });

              // Generate authorization URL with PKCE and save data
              const authInfo = await oauthProvider.generateAuthRequest();

              // Save server configuration for callback processing
              const serverInfoPath = join(oauthBaseDir, "server_info.json");
              await Deno.writeTextFile(
                serverInfoPath,
                JSON.stringify(
                  {
                    serverId: details.serverId,
                    serverUrl: details.serverUrl,
                    serverConfig: serverConfig,
                  },
                  null,
                  2,
                ),
              );

              // Read the saved state to include in response
              const statePath = join(oauthBaseDir, "state");
              const savedState = await Deno.readTextFile(statePath);

              return c.json({
                success: false,
                requiresOAuth: true,
                code: error.code,
                message: error.message,
                authUrl: authInfo.uri,
                state: savedState,
                details: error.details,
              }, 202); // 202 Accepted - additional action required
            } catch (oauthError) {
              console.error(`Failed to generate OAuth URL: ${oauthError}`);
              return c.json({
                success: false,
                requiresOAuth: true,
                code: error.code,
                message: "OAuth required but failed to generate auth URL",
                error: oauthError instanceof Error
                  ? oauthError.message
                  : "Unknown error",
                details: error.details,
              }, 202);
            }
          }
          if (error.code === "auth_failed") {
            throw new ApiError(401, error.code, error.message, error.details);
          }
        }
        throw error;
      }
      return c.body(null, 201);
    },
  );

  // Deregister MCP server
  mcpRouter.delete("/servers/:id", async (c) => {
    const id = McpServerIdSchema.parse(c.req.param("id"));
    await mcpServerManager.deregisterServer(id);
    return c.body(null, 204);
  });

  // Update MCP server configuration
  mcpRouter.put(
    "/servers/:id",
    zValidator("json", McpServerApiSchema),
    async (c) => {
      const id = c.req.param("id") ?? "";
      const config = c.req.valid("json")[id];
      if (!config) {
        throw new ApiError(
          400,
          "invalid_request",
          "Invalid server configuration",
        );
      }
      await mcpServerManager.updateServerConfig(id, config);
      return c.body(null, 204);
    },
  );

  // Query available tools from registered MCP servers
  mcpRouter.get("/tools", (c) => {
    const tools = Array.from(mcpServerManager.getAllTools().keys());
    return c.json({ tools });
  });

  // Reload MCP server configuration
  mcpRouter.get("/reload", async (c) => {
    await mcpServerManager.reloadConfig();
    return c.body(null, 200);
  });

  // Get server config
  mcpRouter.get("/servers/:id", (c) => {
    const id = McpServerIdSchema.parse(c.req.param("id"));
    const { enabled: _enabled, ...rest } = mcpServerManager.getServerConfig(id);
    return c.json({ [id]: rest });
  });

  // Register MCP server from registry
  mcpRouter.post("/registry/:id", async (c) => {
    const id = c.req.param("id");
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) {
      throw new ApiError(401, "unauthorized", "No token provided");
    }
    await mcpServerManager.registerServerFromRegistry(id, token);
    return c.body(null, 202);
  });

  // Retry MCP server registration after OAuth
  mcpRouter.post(
    "/servers/:id/retry-oauth",
    zValidator("json", McpServerConfigSchema),
    async (c) => {
      const id = McpServerIdSchema.parse(c.req.param("id"));
      const config = c.req.valid("json");

      try {
        await mcpServerManager.retryServerRegistrationWithOAuth(id, config);
        return c.json({
          success: true,
          message:
            `Server ${id} registered successfully with OAuth authentication`,
        }, 201);
      } catch (error) {
        if (error instanceof McpServerError) {
          if (error.code === "oauth_required") {
            return c.json({
              success: false,
              requiresOAuth: true,
              code: error.code,
              message: "OAuth authentication still required",
              details: error.details,
            }, 202);
          }
          if (error.code === "auth_failed") {
            throw new ApiError(401, error.code, error.message, error.details);
          }
        }
        throw error;
      }
    },
  );

  return mcpRouter;
}
