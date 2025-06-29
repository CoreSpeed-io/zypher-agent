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
      const callbackPort = c.req.query("callbackPort") ?? 8964;
      const host = c.req.query("host") ?? "localhost";

      try {
        // Convert CursorConfig to ZypherMcpServer[] and register each server
        const zypherServers = await parseLocalServers(servers);
        await Promise.all(
          zypherServers.map(
            async (server) =>
              await mcpServerManager.registerServer(server, {
                serverUrl: server.remotes?.[0]?.url ?? "",
                callbackPort: Number(callbackPort),
                clientName: clientName,
                host: host,
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
    const clientName = c.req.query("clientName") ?? "zypher-agent-api-registry";
    const callbackPort = c.req.query("callbackPort") ?? 8964;
    const host = c.req.query("host") ?? "localhost";

    try {
      await mcpServerManager.registerServerFromRegistry(id, token ?? "", {
        callbackPort: Number(callbackPort),
        clientName: clientName,
        host: host,
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
