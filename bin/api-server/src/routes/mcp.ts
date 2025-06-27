import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { type McpServerManager } from "../../../../src/mcp/McpServerManager.ts";
import { z } from "zod";
import { ApiError } from "../error.ts";
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
      const _callbackUrl = c.req.query("callbackUrl"); //
      // Get callback URL from frontend

      try {
        // Convert CursorConfig to ZypherMcpServer[] and register each server
        const zypherServers = await parseLocalServers(servers);
        await Promise.all(
          zypherServers.map(
            async (server) =>
              await mcpServerManager.registerServer(server, {
                serverUrl: server.remotes?.[0]?.url ?? "",
                callbackPort: 3000,
                clientName: clientName,
                host: "localhost",
              }),
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
      await mcpServerManager.registerServerFromRegistry(id, token ?? "", {
        callbackPort: 3000,
        clientName: clientName,
        host: "localhost",
      });
      return c.body(null, 202);
    } catch (error) {
      throw new ApiError(
        500,
        "internal_server_error",
        `Failed to register server from registry ${formatError(error)}`,
      );
    }
  });
  return mcpRouter;
}
