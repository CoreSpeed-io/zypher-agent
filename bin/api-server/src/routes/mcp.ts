import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  McpServerError,
  McpServerManager,
} from "../../../../src/mcp/McpServerManager.ts";
import {
  McpServerConfigSchema,
  McpServerIdSchema,
} from "../../../../src/mcp/types.ts";
import { z } from "zod";
import { ApiError } from "../error.ts";

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
    "/mcp/servers/:id/status",
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
        if (
          error instanceof McpServerError && error.code === "already_exists"
        ) {
          throw new ApiError(409, error.code, error.message, error.details);
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
  mcpRouter.post("/registry/servers/:id", async (c) => {
    const id = McpServerIdSchema.parse(c.req.param("id"));
    await mcpServerManager.registerServerFromRegistry(id);
    return c.body(null, 202);
  });

  return mcpRouter;
}
