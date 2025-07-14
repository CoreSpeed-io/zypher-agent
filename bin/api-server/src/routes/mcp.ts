import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { type McpServerManager } from "../../../../src/mcp/McpServerManager.ts";
import { z } from "zod";
import { ApiError } from "../error.ts";
import {
  CursorConfigSchema,
  parseLocalServers,
} from "../../../../src/mcp/types/cursor.ts";
import { createRedirectCapture } from "../../../../src/mcp/auth/redirectCapture.ts";

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
      const clientName = c.req.query("clientName") ?? "zypher-agent-api";
      const callbackPort = c.req.query("callbackPort");
      const host = c.req.query("host") ?? "localhost";

      // Convert CursorConfig to ZypherMcpServer[] and register each server
      const zypherServers = await parseLocalServers(servers);
      // Capture the ID of the first (and usually only) server being registered so the
      // frontend can reference it when completing OAuth.
      const serverId = zypherServers[0]?._id;

      // Setup redirect capture helper
      const {
        onRedirect,
        redirectPromise,
        getAuthUrl,
      } = createRedirectCapture();

      // Kick off all registrations in parallel
      const registrationPromise = Promise.all(
        zypherServers.map((server) =>
          mcpServerManager.registerServer(server, {
            serverUrl: server.remotes?.[0]?.url ?? "",
            callbackPort: Number(callbackPort),
            clientName: clientName,
            host: host,
            onRedirect,
          })
        ),
      );

      // Wait until either a redirect URL is available or all registrations
      // complete without requiring OAuth.
      await Promise.race([redirectPromise, registrationPromise]);

      if (getAuthUrl()) {
        return c.json(
          {
            requiresOAuth: true,
            authenticationUrl: getAuthUrl(),
            serverId,
          },
          202,
        );
      }

      // If we reached here, all registrations completed successfully without
      // requiring OAuth.
      await registrationPromise; // ensure any errors propagate
      return c.json({ requiresOAuth: false, serverId }, 201);
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
      console.log("[id]", id);
      const config = c.req.valid("json");
      if (!config) {
        throw new ApiError(
          400,
          "invalid_request",
          "Invalid server configuration",
        );
      }
      const zypherServers = await parseLocalServers(config, id);
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
    return c.json({ [server.name ?? id]: server });
  });

  // Register MCP server from registry
  mcpRouter.post("/registry/:id", async (c) => {
    const id = c.req.param("id");
    const token = c.req.header("Authorization")?.split(" ")[1];
    const clientName = c.req.query("clientName");
    const callbackPort = c.req.query("callbackPort");
    const callbackPath = c.req.query("callbackPath");
    const host = c.req.query("host") ?? "localhost";
    const {
      onRedirect,
      redirectPromise,
      getAuthUrl,
    } = createRedirectCapture();

    const registrationPromise = mcpServerManager.registerServerFromRegistry(
      id,
      token ?? "",
      {
        callbackPort: Number(callbackPort),
        clientName: clientName,
        host: host,
        callbackPath: callbackPath,
        onRedirect,
      },
    );

    // Wait until either the redirect URL is available or the registration
    // completes without requiring OAuth.
    await Promise.race([redirectPromise, registrationPromise]);

    if (getAuthUrl()) {
      return c.json(
        {
          requiresOAuth: true,
          authenticationUrl: getAuthUrl(),
          serverId: id,
        },
        202,
      );
    }

    // Ensure any errors propagate and registration finishes.
    await registrationPromise;
    return c.json({ requiresOAuth: false, serverId: id }, 202);
  });

  mcpRouter.get("/registry/servers", async (c) => {
    const servers = await mcpServerManager.getAllServersFromRegistry();
    return c.json({ servers });
  });

  // Handle OAuth callback from frontend
  mcpRouter.get(
    "/servers/:id/oauth/callback",
    async (c) => {
      const id = c.req.param("id");
      const code = c.req.query("code");
      const state = c.req.query("state");
      const clientName = c.req.query("clientName");

      if (!code || !state) {
        throw new ApiError(400, "invalid_request", "Missing code or state");
      }

      try {
        // Get the MCP client for this server
        const client = mcpServerManager.getClient(id);
        if (!client) {
          throw new ApiError(404, "not_found", `Server ${id} not found`);
        }

        // Handle the OAuth callback through the client
        const success = await client.handleOAuthCallback(
          code,
          state,
          clientName,
        );

        if (success) {
          return c.json({
            success: true,
            message: "OAuth authentication completed successfully",
            serverId: id,
            serverRegistered: true,
          });
        } else {
          throw new ApiError(
            400,
            "oauth_failed",
            "OAuth authentication failed",
          );
        }
      } catch (error) {
        console.error(`OAuth callback failed for server ${id}:`, error);
        throw new ApiError(
          500,
          "server_error",
          `OAuth callback processing failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    },
  );

  return mcpRouter;
}
