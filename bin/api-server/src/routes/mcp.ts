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
  requestUrl?: URL,
): Promise<RemoteOAuthProvider> {
  const dataDir = await getWorkspaceDataDir();
  const oauthBaseDir = join(dataDir, "oauth", serverId);
  await ensureDir(oauthBaseDir);

  // Auto-detect host and protocol from request if available
  let host: string | undefined;
  let useHttps: boolean | undefined;
  let callbackPort: number | undefined;

  if (requestUrl) {
    host = requestUrl.hostname;
    useHttps = requestUrl.protocol === "https:";
    // Only include port if it's not the default for the protocol
    const port = requestUrl.port
      ? Number.parseInt(requestUrl.port)
      : (useHttps ? 443 : 80);
    callbackPort = (useHttps && port === 443) || (!useHttps && port === 80)
      ? undefined
      : port;
  }

  return new RemoteOAuthProvider({
    serverId,
    serverUrl,
    oauthBaseDir,
    clientName: "zypher-agent-api",
    // Auto-detected configuration from request
    host,
    callbackPort,
    useHttps,
  });
}

// Helper function to generate OAuth response
async function generateOAuthResponse(
  serverId: string,
  serverUrl: string,
  requestUrl: URL,
  serverConfig?: z.infer<typeof McpServerConfigSchema>,
  registryToken?: string,
  isFromRegistry = false,
) {
  const dataDir = await getWorkspaceDataDir();
  const oauthBaseDir = join(dataDir, "oauth", serverId);
  await ensureDir(oauthBaseDir);

  // Auto-detect host and protocol from request
  const host = requestUrl.hostname;
  const useHttps = requestUrl.protocol === "https:";
  const port = requestUrl.port
    ? Number.parseInt(requestUrl.port)
    : (useHttps ? 443 : 80);
  const callbackPort = (useHttps && port === 443) || (!useHttps && port === 80)
    ? undefined
    : port;

  const oauthProvider = new RemoteOAuthProvider({
    serverId,
    serverUrl,
    oauthBaseDir,
    clientName: "zypher-agent-api",
    // Auto-detected configuration from request
    host,
    callbackPort,
    useHttps,
  });

  // Generate authorization URL with PKCE and save data
  const authInfo = await oauthProvider.generateAuthRequest();

  // Save server information for callback processing
  const serverInfoPath = join(oauthBaseDir, "server_info.json");
  const serverInfoData: ServerInfo = {
    serverId,
    serverUrl,
  };

  if (isFromRegistry) {
    serverInfoData.fromRegistry = true;
    serverInfoData.registryToken = registryToken || "";
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
        return c.body(null, 201);
      } catch (error) {
        // Only handle OAuth requirement - let other errors go to centralized handler
        if (
          error instanceof McpServerError && error.code === "oauth_required"
        ) {
          const details = error.details as {
            serverId: string;
            serverUrl: string;
          };
          const serverId = details.serverId;
          const serverConfig = servers[serverId];

          const oauthResponse = await generateOAuthResponse(
            serverId,
            details.serverUrl,
            new URL(c.req.url),
            serverConfig,
            undefined,
            false,
          );

          return c.json({
            success: false,
            requiresOAuth: true,
            oauth: {
              authUrl: oauthResponse.authUrl,
              state: oauthResponse.state,
              instructions:
                "Please open the authUrl in a browser to complete OAuth authentication",
            },
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          }, 202);
        }
        // Let centralized error handler deal with all other errors
        throw error;
      }
    },
  );

  // Deregister MCP server
  mcpRouter.delete("/servers/:id", async (c) => {
    const serverName = McpServerIdSchema.parse(c.req.param("id"));
    await mcpServerManager.deregisterServerByName(serverName);
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
    // if (!token) {
    //   throw new ApiError(401, "unauthorized", "No token provided");
    // }

    try {
      await mcpServerManager.registerServerFromRegistry(id, token ?? "");
      return c.body(null, 202);
    } catch (error) {
      // Only handle OAuth requirement - let other errors go to centralized handler
      if (error instanceof McpServerError && error.code === "oauth_required") {
        const details = error.details as {
          serverId: string;
          serverUrl: string;
        };
        const serverId = details.serverId;

        const oauthResponse = await generateOAuthResponse(
          serverId,
          details.serverUrl,
          new URL(c.req.url),
          undefined,
          token,
          true,
        );

        return c.json({
          success: false,
          requiresOAuth: true,
          oauth: {
            authUrl: oauthResponse.authUrl,
            state: oauthResponse.state,
            instructions:
              "Please open the authUrl in a browser to complete OAuth authentication",
          },
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        }, 202);
      }
      // Let centralized error handler deal with all other errors
      throw error;
    }
  });

  // Process OAuth callback for server registration (GET request with query parameters)
  mcpRouter.get("/servers/:id/oauth/callback", async (c) => {
    const serverId = c.req.param("id");
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const error_description = c.req.query("error_description");

    const callbackData = {
      code: code || "",
      state: state || "",
      error: error || "",
      error_description: error_description || "",
    };

    const dataDir = await getWorkspaceDataDir();
    const oauthBaseDir = join(dataDir, "oauth", serverId);
    const serverInfoPath = join(oauthBaseDir, "server_info.json");

    const serverInfoText = await Deno.readTextFile(serverInfoPath);
    const serverInfo = JSON.parse(serverInfoText) as ServerInfo;
    const serverUrl = serverInfo.serverUrl;

    const oauthProvider = await createOAuthProvider(
      serverId,
      serverUrl,
      new URL(c.req.url),
    );
    const tokens = await oauthProvider.processCallback(callbackData);
    await oauthProvider.saveTokens(tokens);

    if (!tokens?.access_token) {
      throw new Error("Failed to obtain access token");
    }

    // Deregister server first (ignore errors if not exists)
    try {
      await mcpServerManager.deregisterServer(serverId);
    } catch {
      // Ignore if server doesn't exist
    }

    // Check if this is a registry registration or config registration
    if (serverInfo.fromRegistry) {
      // Registry-based registration with saved token (may be empty string)
      await mcpServerManager.registerServerFromRegistry(
        serverId,
        serverInfo.registryToken || "",
      );
    } else if (serverInfo.serverConfig) {
      // Config-based registration
      await mcpServerManager.registerServer(
        serverId,
        serverInfo.serverConfig,
      );
    } else {
      throw new Error(
        "Invalid server info: missing both registry token and server config",
      );
    }

    // Return success JSON response instead of HTML
    return c.json({
      success: true,
      message: "OAuth authentication completed successfully",
      serverId: serverId,
      serverRegistered: true,
    });
  });

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

    const oauthProvider = await createOAuthProvider(
      serverId,
      serverConfig.url,
      new URL(c.req.url),
    );
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

    const oauthProvider = await createOAuthProvider(
      serverId,
      serverConfig.url,
      new URL(c.req.url),
    );
    await oauthProvider.clearAuthData();

    return c.json({
      success: true,
      message: "OAuth data cleared successfully",
    });
  });

  return mcpRouter;
}
