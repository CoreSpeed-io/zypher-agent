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

// OAuth callback validation schema
const CallbackDataSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

// Server info interface for OAuth callback processing
interface ServerInfo {
  serverId: string;
  serverUrl: string;
  serverConfig?: z.infer<typeof McpServerConfigSchema>;
  fromRegistry?: boolean;
  registryToken?: string;
}

// Helper function to create OAuth provider
async function createOAuthProvider(
  serverId: string,
  serverUrl: string,
): Promise<RemoteOAuthProvider> {
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

// Helper function to generate OAuth response
async function generateOAuthResponse(
  serverId: string,
  serverUrl: string,
  serverConfig?: z.infer<typeof McpServerConfigSchema>,
  registryToken?: string,
) {
  const dataDir = await getWorkspaceDataDir();
  const oauthBaseDir = join(dataDir, "oauth", serverId);
  await ensureDir(oauthBaseDir);

  const oauthProvider = new RemoteOAuthProvider({
    serverId,
    serverUrl,
    oauthBaseDir,
    clientName: "zypher-agent-api",
  });

  // Generate authorization URL with PKCE and save data
  const authInfo = await oauthProvider.generateAuthRequest();

  // Save server information for callback processing
  const serverInfoPath = join(oauthBaseDir, "server_info.json");
  const serverInfoData: ServerInfo = {
    serverId,
    serverUrl,
  };

  if (registryToken) {
    serverInfoData.fromRegistry = true;
    serverInfoData.registryToken = registryToken;
  } else {
    serverInfoData.serverConfig = serverConfig;
  }

  await Deno.writeTextFile(
    serverInfoPath,
    JSON.stringify(serverInfoData, null, 2),
  );

  // Read the saved state to include in response
  const statePath = join(oauthBaseDir, "state");
  const savedState = await Deno.readTextFile(statePath);

  return {
    success: false,
    requiresOAuth: true,
    authUrl: authInfo.uri,
    state: savedState,
  };
}

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
            const details = error.details as {
              serverId: string;
              serverUrl: string;
            };
            const serverConfig = servers[details.serverId];

            const oauthResponse = await generateOAuthResponse(
              details.serverId,
              details.serverUrl,
              serverConfig,
            );

            return c.json({
              ...oauthResponse,
              code: error.code,
              message: error.message,
              details: error.details,
            }, 202);
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

    try {
      await mcpServerManager.registerServerFromRegistry(id, token);
      return c.body(null, 202);
    } catch (error) {
      if (error instanceof McpServerError) {
        if (error.code === "oauth_required") {
          // Generate OAuth URL for registry server
          const details = error.details as {
            serverId: string;
            serverUrl: string;
          };

          const oauthResponse = await generateOAuthResponse(
            details.serverId,
            details.serverUrl,
            undefined,
            token,
          );

          return c.json({
            ...oauthResponse,
            code: error.code,
            message: error.message,
            details: error.details,
          }, 202);
        }
        if (error.code === "auth_failed") {
          throw new ApiError(401, error.code, error.message, error.details);
        }
      }
      throw error;
    }
  });

  // Process OAuth callback for server registration
  mcpRouter.post(
    "/servers/:id/oauth/callback",
    zValidator("json", CallbackDataSchema),
    async (c) => {
      const serverId = c.req.param("id");
      const callbackData = c.req.valid("json");

      const dataDir = await getWorkspaceDataDir();
      const oauthBaseDir = join(dataDir, "oauth", serverId);
      const serverInfoPath = join(oauthBaseDir, "server_info.json");

      const serverInfoText = await Deno.readTextFile(serverInfoPath);
      const serverInfo = JSON.parse(serverInfoText);
      const serverUrl = serverInfo.serverUrl;
      const serverConfig = serverInfo.serverConfig;

      const oauthProvider = await createOAuthProvider(serverId, serverUrl);
      const tokens = await oauthProvider.processCallback(callbackData);
      await oauthProvider.saveTokens(tokens);

      if (!tokens?.access_token) {
        throw new Error("Failed to obtain access token");
      }

      // Deregister server first (ignore errors if not exists)
      await mcpServerManager.deregisterServer(serverId);

      // Check if this is a registry registration or config registration
      if (serverInfo.fromRegistry) {
        // Registry-based registration with saved token
        await mcpServerManager.registerServerFromRegistry(
          serverId,
          serverInfo.registryToken,
        );
      } else {
        // Config-based registration
        await mcpServerManager.registerServer(serverId, serverConfig);
      }

      return c.json({
        success: true,
        message:
          "OAuth authentication completed and server registered successfully",
        registered: true,
      });
    },
  );

  // Get OAuth status for a server
  mcpRouter.get("/servers/:id/oauth/status", async (c) => {
    const serverId = c.req.param("id");
    const serverConfig = mcpServerManager.getServerConfig(serverId);

    if (!("url" in serverConfig)) {
      throw new ApiError(
        400,
        "invalid_server",
        "OAuth is only supported for SSE-mode servers with URLs",
      );
    }

    const oauthProvider = await createOAuthProvider(serverId, serverConfig.url);
    const tokens = await oauthProvider.tokens();
    const hasValidTokens = !!(tokens?.access_token);

    return c.json({
      success: true,
      authenticated: hasValidTokens,
      hasTokens: hasValidTokens,
    });
  });

  // Clear OAuth data for a server
  mcpRouter.delete("/servers/:id/oauth", async (c) => {
    const serverId = c.req.param("id");
    const serverConfig = mcpServerManager.getServerConfig(serverId);

    if (!("url" in serverConfig)) {
      throw new ApiError(
        400,
        "invalid_server",
        "OAuth is only supported for SSE-mode servers with URLs",
      );
    }

    const oauthProvider = await createOAuthProvider(serverId, serverConfig.url);
    await oauthProvider.clearAuthData();

    return c.json({
      success: true,
      message: "OAuth data cleared successfully",
    });
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
