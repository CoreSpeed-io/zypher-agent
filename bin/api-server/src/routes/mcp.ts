import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { type McpServerManager } from "../../../../src/mcp/McpServerManager.ts";
import { z } from "zod";
import { ApiError } from "../error.ts";
import { RemoteOAuthProvider } from "../auth/RemoteOAuthProvider.ts";
import { getWorkspaceDataDir } from "../../../../src/utils/mod.ts";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import {
  CursorConfigSchema,
  parseLocalServers,
} from "../../../../src/mcp/types/cursor.ts";
import { formatError } from "../../../../src/error.ts";

// Server info interface for OAuth callback processing
interface ServerInfo {
  serverId: string;
  serverUrl: string;
  serverConfig?: z.infer<typeof CursorConfigSchema>;
  fromRegistry?: boolean;
  registryToken?: string;
  /** The exact redirect URI that was used when generating the authorization request. */
  redirectUri?: string;
}

// Helper function to generate OAuth response
async function _generateOAuthResponse(
  clientName: string,
  serverId: string,
  serverUrl: string,
  requestUrl: URL,
  callbackUrl?: string,
  serverConfig?: z.infer<typeof CursorConfigSchema>,
  registryToken?: string,
  isFromRegistry = false,
) {
  const dataDir = await getWorkspaceDataDir();
  const oauthBaseDir = join(dataDir, "oauth", serverId);
  await ensureDir(oauthBaseDir);

  // Use provided callback URL or auto-detect from request
  let finalCallbackUrl: string;
  if (callbackUrl) {
    // Frontend provided callback URL - add serverId and clientName as query parameters
    const callbackUrlObj = new URL(callbackUrl);
    callbackUrlObj.searchParams.set("serverId", serverId);
    finalCallbackUrl = callbackUrlObj.toString();
  } else {
    // Fallback to auto-detection for backward compatibility
    const host = requestUrl.hostname;
    const useHttps = requestUrl.protocol === "https:";
    const port = requestUrl.port
      ? Number.parseInt(requestUrl.port)
      : (useHttps ? 443 : 80);
    const callbackPort =
      (useHttps && port === 443) || (!useHttps && port === 80)
        ? undefined
        : port;

    const protocol = useHttps ? "https" : "http";
    const portSuffix = callbackPort ? `:${callbackPort}` : "";
    finalCallbackUrl =
      `${protocol}://${host}${portSuffix}/mcp/servers/${serverId}/oauth/callback?clientName=${
        encodeURIComponent(clientName)
      }`;
  }

  // Create OAuth provider with the final callback URL
  const oauthProvider = new RemoteOAuthProvider({
    serverId,
    serverUrl,
    oauthBaseDir,
    clientName,
    redirectUri: finalCallbackUrl,
  });

  // Generate authorization URL with PKCE and save data
  const authInfo = await oauthProvider.generateAuthRequest();

  // Save server information for callback processing
  const serverInfoPath = join(oauthBaseDir, "server_info.json");
  const serverInfoData: ServerInfo = {
    serverId,
    serverUrl,
    redirectUri: finalCallbackUrl,
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
    callbackUrl: finalCallbackUrl,
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
      const id = c.req.param("id");
      const { enabled } = c.req.valid("json");
      await mcpServerManager.setServerStatus(id, enabled);
      return c.body(null, 204);
    },
  );

  // Register new MCP server
  mcpRouter.post(
    "/register",
    zValidator("json", CursorConfigSchema),
    async (c) => {
      const servers = c.req.valid("json");
      const _clientName = c.req.query("clientName") ?? "zypher-agent-api";
      const _callbackUrl = c.req.query("callbackUrl"); //
      // Get callback URL from frontend

      try {
        // Convert CursorConfig to ZypherMcpServer[] and register each server
        const zypherServers = await parseLocalServers(servers);
        await Promise.all(
          zypherServers.map(
            async (server) => await mcpServerManager.registerServer(server),
          ),
        );
        return c.body(null, 201);
      } catch (error) {
        throw new ApiError(
          500,
          "internal_server_error",
          `Failed to register server ${formatError(error)}`,
        );
      }
    },
  );

  // Deregister MCP server
  mcpRouter.delete("/servers/:id", async (c) => {
    const id = c.req.param("id");
    await mcpServerManager.deregisterServer(id);

    return c.body(null, 204);
  });

  // Update MCP server configuration
  mcpRouter.put(
    "/servers/:id",
    zValidator("json", CursorConfigSchema),
    async (c) => {
      const id = c.req.param("id") ?? "";
      const config = c.req.valid("json");
      if (!config) {
        throw new ApiError(
          400,
          "invalid_request",
          "Invalid server configuration",
        );
      }
      const zypherServers = await parseLocalServers(config);
      await mcpServerManager.updateServerConfig(id, zypherServers);
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
    const id = c.req.param("id");
    const server = mcpServerManager.getServerConfig(id);
    return c.json({ [id]: server });
  });

  // Register MCP server from registry
  mcpRouter.post("/registry/:id", async (c) => {
    const id = c.req.param("id");
    const token = c.req.header("Authorization")?.split(" ")[1];
    const clientName = c.req.query("clientName") ?? "zypher-agent-api";
    const callbackUrl = c.req.query("callbackUrl"); // Get callback URL from frontend
    console.log("[clientName]", clientName);
    console.log("[callbackUrl]", callbackUrl);
    // if (!token) {
    //   throw new ApiError(401, "unauthorized", "No token provided");
    // }

    try {
      await mcpServerManager.registerServerFromRegistry(id, token ?? "");
      return c.body(null, 202);
    } catch (error) {
      throw new ApiError(
        500,
        "internal_server_error",
        `Failed to register server from registry ${formatError(error)}`,
      );
    }
  });

  // Process OAuth callback for server registration (GET request with query parameters)
  mcpRouter.get("/servers/:id/oauth/callback", async (c) => {
    const serverId = c.req.param("id");
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const error_description = c.req.query("error_description");
    const clientName = c.req.query("clientName") ?? "zypher-agent-api";

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

    // Reconstruct the exact redirect URI that was used when generating the
    // authorization request. Prefer the persisted value if available to avoid
    // accidentally including transient parameters like `code` and `state`.

    let redirectUri: string;

    if (serverInfo.redirectUri) {
      // Persisted value from the original request – guaranteed to match.
      redirectUri = serverInfo.redirectUri;
    } else {
      // Fallback: rebuild from the current request URL but REMOVE the OAuth
      // response parameters (`code`, `state`, `error`, etc.) so that it matches
      // the URI used in the initial authorization request.
      const requestUrl = new URL(c.req.url);
      const rebuilt = new URL(requestUrl.origin + requestUrl.pathname);

      // Preserve custom query parameters that existed during the original
      // request (e.g. `clientName`) but skip OAuth-specific ones.
      for (const [key, value] of requestUrl.searchParams.entries()) {
        if (
          key !== "code" &&
          key !== "state" &&
          key !== "error" &&
          key !== "error_description"
        ) {
          rebuilt.searchParams.set(key, value);
        }
      }

      redirectUri = rebuilt.toString();
    }

    const oauthProvider = new RemoteOAuthProvider({
      serverId,
      serverUrl,
      oauthBaseDir,
      clientName,
      redirectUri,
    });

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
      const zypherServers = await parseLocalServers(serverInfo.serverConfig);
      await mcpServerManager.registerServer(zypherServers[0]);
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
    const clientName = c.req.query("clientName") ?? "zypher-agent-api";
    const serverConfig = mcpServerManager.getServerConfig(serverId);

    if (!("url" in serverConfig)) {
      throw new ApiError(
        400,
        "invalid_server",
        "OAuth is only supported for SSE-mode servers with URLs",
      );
    }

    const dataDir = await getWorkspaceDataDir();
    const oauthBaseDir = join(dataDir, "oauth", serverId);

    // Create OAuth provider for status checking
    // We don't need a specific callback URL for status checking
    const oauthProvider = new RemoteOAuthProvider({
      serverId,
      serverUrl: serverConfig.url as string,
      oauthBaseDir,
      clientName,
    });

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
    const clientName = c.req.query("clientName") ?? "zypher-agent-api";

    if (!("url" in serverConfig)) {
      throw new ApiError(
        400,
        "invalid_server",
        "OAuth is only supported for SSE-mode servers with URLs",
      );
    }

    const dataDir = await getWorkspaceDataDir();
    const oauthBaseDir = join(dataDir, "oauth", serverId);

    // Create OAuth provider for clearing data
    // We don't need a specific callback URL for clearing data
    const oauthProvider = new RemoteOAuthProvider({
      serverId,
      serverUrl: serverConfig.url as string,
      oauthBaseDir,
      clientName,
    });

    await oauthProvider.clearAuthData();

    return c.json({
      success: true,
      message: "OAuth data cleared successfully",
    });
  });

  return mcpRouter;
}
