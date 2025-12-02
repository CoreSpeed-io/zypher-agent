import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "@std/testing/bdd";
import { expect } from "@std/expect";
import { McpServerManager } from "../src/mcp/McpServerManager.ts";
import type { McpServerEndpoint } from "../src/mcp/mod.ts";
import type { Tool } from "../src/tools/mod.ts";
import { createZypherContext } from "@zypher/utils/mod.ts";
import type { ZypherContext } from "@zypher/ZypherAgent.ts";
import type { McpServerManagerEvent } from "../src/mcp/McpServerManager.ts";

describe("McpServerManager", () => {
  let context: ZypherContext;
  let manager: McpServerManager;

  // Helper to create a server endpoint for testing.
  // We use a fake command ("echo") because tests register servers with enabled=false,
  // which skips the actual connection attempt. This allows testing manager logic
  // without needing real MCP servers.
  function createServerEndpoint(id: string): McpServerEndpoint {
    return {
      id,
      displayName: `Test Server ${id}`,
      type: "command",
      command: {
        command: "echo",
        args: ["test"],
      },
    };
  }
  // Helper to create a mock tool
  function createMockTool(name: string): Tool {
    return {
      name,
      description: `Mock tool ${name}`,
      parameters: { type: "object", properties: {} },
      execute: () => Promise.resolve("ok"),
    };
  }

  beforeAll(async () => {
    context = await createZypherContext(Deno.cwd());
  });

  beforeEach(() => {
    manager = new McpServerManager(context);
  });

  afterEach(async () => {
    await manager.dispose();
  });

  describe("Server ID Validation", () => {
    it("should accept valid server ID with alphanumeric characters", async () => {
      const endpoint = createServerEndpoint("myServer123");
      await manager.registerServer(endpoint, false);
      expect(manager.servers.has("myServer123")).toBe(true);
    });

    it("should accept valid server ID with hyphens", async () => {
      const endpoint = createServerEndpoint("my-server");
      await manager.registerServer(endpoint, false);
      expect(manager.servers.has("my-server")).toBe(true);
    });

    it("should accept valid server ID with underscores", async () => {
      const endpoint = createServerEndpoint("my_server_1");
      await manager.registerServer(endpoint, false);
      expect(manager.servers.has("my_server_1")).toBe(true);
    });

    it("should reject server ID with dots", async () => {
      const endpoint = createServerEndpoint("my.server");
      await expect(manager.registerServer(endpoint, false)).rejects.toThrow(
        'Invalid server ID "my.server"',
      );
    });

    it("should reject server ID with spaces", async () => {
      const endpoint = createServerEndpoint("my server");
      await expect(manager.registerServer(endpoint, false)).rejects.toThrow(
        'Invalid server ID "my server"',
      );
    });

    it("should reject server ID with @ symbol (scope format)", async () => {
      const endpoint = createServerEndpoint("@scope/name");
      await expect(manager.registerServer(endpoint, false)).rejects.toThrow(
        'Invalid server ID "@scope/name"',
      );
    });

    it("should reject server ID with special characters", async () => {
      const endpoint = createServerEndpoint("server!@#");
      await expect(manager.registerServer(endpoint, false)).rejects.toThrow(
        'Invalid server ID "server!@#"',
      );
    });
  });

  describe("Server Registration", () => {
    it("should register server successfully with enabled=false", async () => {
      const endpoint = createServerEndpoint("test-server");

      await manager.registerServer(endpoint, false);

      expect(manager.servers.size).toBe(1);
      const serverInfo = manager.servers.get("test-server");
      expect(serverInfo).toBeDefined();
      expect(serverInfo!.server.id).toBe("test-server");
      expect(serverInfo!.source.type).toBe("direct");
    });

    it("should reject duplicate server registration", async () => {
      const endpoint = createServerEndpoint("duplicate-server");

      await manager.registerServer(endpoint, false);

      await expect(manager.registerServer(endpoint, false)).rejects.toThrow(
        "Server duplicate-server already exists",
      );
    });

    it("should reject registration after dispose", async () => {
      await manager.dispose();

      const endpoint = createServerEndpoint("post-dispose");

      await expect(manager.registerServer(endpoint, false)).rejects.toThrow(
        "McpServerManager has been disposed",
      );
    });
  });

  describe("Server Deregistration", () => {
    it("should deregister existing server", async () => {
      const endpoint = createServerEndpoint("to-remove");

      await manager.registerServer(endpoint, false);
      expect(manager.servers.has("to-remove")).toBe(true);

      await manager.deregisterServer("to-remove");
      expect(manager.servers.has("to-remove")).toBe(false);
    });

    it("should reject deregistration of non-existent server", async () => {
      await expect(manager.deregisterServer("non-existent")).rejects.toThrow(
        "Server with id non-existent not found",
      );
    });

    it("should reject deregistration after dispose", async () => {
      await manager.dispose();

      await expect(manager.deregisterServer("any-server")).rejects.toThrow(
        "McpServerManager has been disposed",
      );
    });
  });

  describe("Server Update", () => {
    it("should reject update of non-existent server", async () => {
      await expect(
        manager.updateServer("non-existent", { enabled: true }),
      ).rejects.toThrow("Server non-existent not found");
    });

    it("should reject update after dispose", async () => {
      await manager.dispose();

      await expect(
        manager.updateServer("any-server", { enabled: true }),
      ).rejects.toThrow("McpServerManager has been disposed");
    });
  });

  describe("Tool Registration", () => {
    it("should register tool successfully", () => {
      const tool = createMockTool("my-tool");

      manager.registerTool(tool);

      expect(manager.getTool("my-tool")).toBe(tool);
    });

    it("should reject duplicate tool registration", () => {
      const tool = createMockTool("duplicate-tool");

      manager.registerTool(tool);

      expect(() => manager.registerTool(tool)).toThrow(
        "Tool duplicate-tool already registered",
      );
    });

    it("should reject tool registration after dispose", async () => {
      await manager.dispose();

      const tool = createMockTool("post-dispose-tool");

      expect(() => manager.registerTool(tool)).toThrow(
        "McpServerManager has been disposed",
      );
    });
  });

  describe("Tool Retrieval", () => {
    it("should get directly registered tool", () => {
      const tool = createMockTool("direct-tool");

      manager.registerTool(tool);

      expect(manager.getTool("direct-tool")).toBe(tool);
    });

    it("should return undefined for non-existent tool", () => {
      expect(manager.getTool("non-existent")).toBeUndefined();
    });

    it("should include directly registered tools in tools getter", () => {
      const tool1 = createMockTool("tool1");
      const tool2 = createMockTool("tool2");

      manager.registerTool(tool1);
      manager.registerTool(tool2);

      const allTools = manager.tools;
      expect(allTools.size).toBe(2);
      expect(allTools.has("tool1")).toBe(true);
      expect(allTools.has("tool2")).toBe(true);
    });
  });

  describe("Event Stream", () => {
    it("should emit serverAdded event on registration", async () => {
      const events: McpServerManagerEvent[] = [];
      manager.events$.subscribe((event) => events.push(event));

      const endpoint = createServerEndpoint("event-server");
      await manager.registerServer(endpoint, false);

      const addedEvent = events.find((e) => e.type === "serverAdded");
      expect(addedEvent).toBeDefined();
      expect(addedEvent!.type).toBe("serverAdded");
      if (addedEvent!.type === "serverAdded") {
        expect(addedEvent!.serverId).toBe("event-server");
        expect(addedEvent!.source.type).toBe("direct");
      }
    });

    it("should emit serverRemoved event on deregistration", async () => {
      const events: McpServerManagerEvent[] = [];

      const endpoint = createServerEndpoint("remove-event-server");
      await manager.registerServer(endpoint, false);

      manager.events$.subscribe((event) => events.push(event));
      await manager.deregisterServer("remove-event-server");

      const removedEvent = events.find((e) => e.type === "serverRemoved");
      expect(removedEvent).toBeDefined();
      if (removedEvent!.type === "serverRemoved") {
        expect(removedEvent!.serverId).toBe("remove-event-server");
      }
    });

    it("should complete event stream on dispose", async () => {
      let completed = false;

      manager.events$.subscribe({
        complete: () => {
          completed = true;
        },
      });

      await manager.dispose();

      expect(completed).toBe(true);
    });
  });

  describe("Dispose", () => {
    it("should clear all servers on dispose", async () => {
      await manager.registerServer(createServerEndpoint("server1"), false);
      await manager.registerServer(createServerEndpoint("server2"), false);

      expect(manager.servers.size).toBe(2);

      await manager.dispose();

      expect(manager.servers.size).toBe(0);
    });

    it("should clear all tools on dispose", async () => {
      manager.registerTool(createMockTool("tool1"));
      manager.registerTool(createMockTool("tool2"));

      expect(manager.tools.size).toBe(2);

      await manager.dispose();

      expect(manager.tools.size).toBe(0);
    });

    it("should be idempotent (multiple dispose calls are safe)", async () => {
      await manager.registerServer(createServerEndpoint("server1"), false);

      await manager.dispose();
      await manager.dispose(); // Should not throw
      await manager.dispose(); // Should not throw

      expect(manager.servers.size).toBe(0);
    });
  });
});
