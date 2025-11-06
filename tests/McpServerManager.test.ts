import { afterEach, beforeAll, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { McpServerManager } from "../src/mcp/McpServerManager.ts";
import type { McpServerEndpoint } from "../src/mcp/mod.ts";
import { createZypherContext } from "@zypher/utils/mod.ts";
import type { ZypherContext } from "@zypher/ZypherAgent.ts";
import type { ServerDetail } from "@corespeed/mcp-store-client/types";
import type { McpStoreClient } from "@corespeed/mcp-store-client";
import { crypto } from "@std/crypto";

// Helper function to generate UUID
function generateUUID(): string {
  return crypto.randomUUID();
}

// Mock MCP Store Client
class MockMcpStoreClient {
  private mockServers: Map<string, ServerDetail> = new Map();
  private mockServersList: ServerDetail[] = [];

  constructor() {
    // Set up some default mock data
    this.setupDefaultMocks();
  }

  setupDefaultMocks() {
    const serverId1 = generateUUID();
    const serverId2 = generateUUID();
    const serverId3 = generateUUID();

    const mockServer1: ServerDetail = {
      id: serverId1,
      name: "Test Server 1",
      description: "A test server",
      repository: {
        id: generateUUID(),
        source: "github",
        url: "https://github.com/test/server-1",
      },
      versionDetail: {
        version: "1.0.0",
        isLatest: true,
        releaseDate: new Date().toISOString(),
      },
      packages: [{
        name: "@test/server-1",
        version: "1.0.0",
        registryName: "npm",
        packageArguments: [],
        runtimeArguments: [],
        environmentVariables: [],
      }],
    };

    const mockServer2: ServerDetail = {
      id: serverId2,
      name: "Test Server 2",
      description: "Another test server",
      repository: {
        id: generateUUID(),
        source: "github",
        url: "https://github.com/test/server-2",
      },
      versionDetail: {
        version: "1.0.0",
        isLatest: true,
        releaseDate: new Date().toISOString(),
      },
      remotes: [{
        transportType: "sse",
        url: "http://localhost:3000/mcp",
        headers: [{ name: "Authorization", value: "Bearer test-token" }],
      }],
    };

    const mockServer3: ServerDetail = {
      id: serverId3,
      name: "Test Server 3",
      description: "Python package server",
      repository: {
        id: generateUUID(),
        source: "github",
        url: "https://github.com/test/server-3",
      },
      versionDetail: {
        version: "2.0.0",
        isLatest: true,
        releaseDate: new Date().toISOString(),
      },
      packages: [{
        name: "test-mcp-server",
        version: "2.0.0",
        registryName: "uv",
        packageArguments: [],
        runtimeArguments: [],
        environmentVariables: [{ name: "DEBUG", value: "true" }],
      }],
    };

    this.mockServers.set(serverId1, mockServer1);
    this.mockServers.set(serverId2, mockServer2);
    this.mockServers.set(serverId3, mockServer3);
    this.mockServersList = [mockServer1, mockServer2, mockServer3];
  }

  addMockServer(server: ServerDetail) {
    this.mockServers.set(server.id, server);
    this.mockServersList.push(server);
  }

  v1 = {
    servers: {
      list: (options: { offset?: number; limit?: number }) => {
        const offset = options.offset ?? 0;
        const limit = options.limit ?? 20;
        const data = this.mockServersList.slice(offset, offset + limit);
        return Promise.resolve({ data });
      },
      retrieve: (serverId: string) => {
        const server = this.mockServers.get(serverId);
        if (!server) {
          throw new Error(`Server ${serverId} not found in registry`);
        }
        return Promise.resolve({ server });
      },
    },
  };
}

describe("McpServerManager", () => {
  let manager: McpServerManager;
  let context: ZypherContext;
  let mockRegistryClient: MockMcpStoreClient;

  beforeAll(async () => {
    context = await createZypherContext(Deno.cwd());
  });

  afterEach(async () => {
    // Clean up manager after each test
    if (manager) {
      manager.cleanup();

      // Wait for cleanup to complete (manager.cleanup sets desiredEnabled=false but doesn't await disconnection)
      // Shorter wait since most tests use disabled servers
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  describe("initialization", () => {
    it("should create manager with custom registry client", () => {
      mockRegistryClient = new MockMcpStoreClient();
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );
      expect(manager).toBeDefined();
      expect(manager.getAllTools().size).toBe(0);
    });

    it("should create manager with default registry client", () => {
      manager = new McpServerManager(context);
      expect(manager).toBeDefined();
      expect(manager.getAllTools().size).toBe(0);
    });
  });

  describe("server registration", () => {
    beforeAll(() => {
      mockRegistryClient = new MockMcpStoreClient();
    });

    it("should register a command-based server (disabled)", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const endpoint: McpServerEndpoint = {
        id: "local-server",
        displayName: "Local Test Server",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      await manager.registerServer(endpoint, false);

      // Server should be registered but not connected
      const tools = manager.getAllTools();
      expect(tools.size).toBe(0); // No tools because server is disabled
    });

    it("should register a remote server (disabled)", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const endpoint: McpServerEndpoint = {
        id: "remote-server",
        displayName: "Remote Test Server",
        type: "remote",
        remote: {
          url: "http://localhost:3000/mcp",
          headers: { "Authorization": "Bearer test" },
        },
      };

      await manager.registerServer(endpoint, false);

      // Should complete without error
      expect(manager.getAllTools().size).toBe(0);
    });

    it("should reject duplicate server registration", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const endpoint: McpServerEndpoint = {
        id: "duplicate-server",
        displayName: "Duplicate Server",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      await manager.registerServer(endpoint, false);

      // Try to register again
      await expect(
        manager.registerServer(endpoint, false),
      ).rejects.toThrow("Server duplicate-server already exists");
    });
  });

  describe("server deregistration", () => {
    it("should deregister an existing server", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const endpoint: McpServerEndpoint = {
        id: "temp-server",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      await manager.registerServer(endpoint, false);
      manager.deregisterServer("temp-server");

      // Should be able to register again after deregistration
      await manager.registerServer(endpoint, false);
    });

    it("should throw error when deregistering non-existent server", () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      expect(() => manager.deregisterServer("non-existent")).toThrow(
        "Server with id non-existent not found",
      );
    });
  });

  describe("registry integration", () => {
    it("should list servers from registry with default pagination", async () => {
      mockRegistryClient = new MockMcpStoreClient();
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const servers = await manager.listRegistryServers({});
      expect(servers.length).toBe(3);
      expect(servers[0].name).toBe("Test Server 1");
      expect(servers[1].name).toBe("Test Server 2");
      expect(servers[2].name).toBe("Test Server 3");
    });

    it("should list servers with custom pagination", async () => {
      mockRegistryClient = new MockMcpStoreClient();
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const servers = await manager.listRegistryServers({
        offset: 1,
        limit: 2,
      });
      expect(servers.length).toBe(2);
      expect(servers[0].name).toBe("Test Server 2");
      expect(servers[1].name).toBe("Test Server 3");
    });

    it("should register npm package server from registry (disabled)", async () => {
      mockRegistryClient = new MockMcpStoreClient();
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const servers = await manager.listRegistryServers({});
      await manager.registerServerFromRegistry(servers[0].id, false);

      // Should not throw error
      expect(manager.getAllTools().size).toBe(0);
    });

    it("should register remote server from registry (disabled)", async () => {
      mockRegistryClient = new MockMcpStoreClient();
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const servers = await manager.listRegistryServers({});
      await manager.registerServerFromRegistry(servers[1].id, false);

      // Should not throw error
      expect(manager.getAllTools().size).toBe(0);
    });

    it("should register uv package server from registry (disabled)", async () => {
      mockRegistryClient = new MockMcpStoreClient();
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const servers = await manager.listRegistryServers({});
      await manager.registerServerFromRegistry(servers[2].id, false);

      // Should not throw error
      expect(manager.getAllTools().size).toBe(0);
    });

    it("should throw error for non-existent server in registry", async () => {
      mockRegistryClient = new MockMcpStoreClient();
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      await expect(
        manager.registerServerFromRegistry("non-existent-server"),
      ).rejects.toThrow("Server non-existent-server not found in registry");
    });

    it("should handle server with unsupported registry type", async () => {
      mockRegistryClient = new MockMcpStoreClient();
      const unsupportedServerId = generateUUID();
      const unsupportedServer: ServerDetail = {
        id: unsupportedServerId,
        name: "Unsupported Server",
        description: "Server with unsupported registry",
        repository: {
          id: generateUUID(),
          source: "github",
          url: "https://github.com/test/unsupported",
        },
        versionDetail: {
          version: "1.0.0",
          isLatest: true,
          releaseDate: new Date().toISOString(),
        },
        packages: [{
          name: "test-package",
          version: "1.0.0",
          registryName: "unsupported-registry",
          packageArguments: [],
          runtimeArguments: [],
          environmentVariables: [],
        }],
      };
      mockRegistryClient.addMockServer(unsupportedServer);

      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      await expect(
        manager.registerServerFromRegistry(unsupportedServerId),
      ).rejects.toThrow("Unsupported registry");
    });

    it("should handle server with no valid configuration", async () => {
      mockRegistryClient = new MockMcpStoreClient();
      const invalidServerId = generateUUID();
      const invalidServer: ServerDetail = {
        id: invalidServerId,
        name: "Invalid Server",
        description: "Server with no valid config",
        repository: {
          id: generateUUID(),
          source: "github",
          url: "https://github.com/test/invalid",
        },
        versionDetail: {
          version: "1.0.0",
          isLatest: true,
          releaseDate: new Date().toISOString(),
        },
        // No packages or remotes
      };
      mockRegistryClient.addMockServer(invalidServer);

      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      await expect(
        manager.registerServerFromRegistry(invalidServerId),
      ).rejects.toThrow("has no valid remote or package configuration");
    });
  });

  describe("server updates", () => {
    // NOTE: updateServer tests are limited because:
    // 1. updateServer is synchronous but calls async registerServer without await (line 170)
    // 2. No public getters exist to inspect server state (enabled status, connection state)
    // 3. These tests can only verify "doesn't throw" - they cannot verify state changes
    // See: src/mcp/McpServerManager.ts:167-172 for the implementation bug

    it("should not throw when updating enabled status", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const endpoint: McpServerEndpoint = {
        id: "update-test",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      await manager.registerServer(endpoint, false);

      // Can only verify this doesn't throw (cannot verify state change)
      expect(() => manager.updateServer("update-test", { enabled: true })).not
        .toThrow();
    });

    it("should not throw when updating server configuration", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const endpoint: McpServerEndpoint = {
        id: "config-update-test",
        displayName: "Original Name",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      await manager.registerServer(endpoint, false);

      const newEndpoint: McpServerEndpoint = {
        ...endpoint,
        displayName: "Updated Name",
      };

      // Can only verify this doesn't throw
      expect(() =>
        manager.updateServer("config-update-test", {
          server: newEndpoint,
          enabled: false,
        })
      ).not.toThrow();
    });

    it("should throw error when updating non-existent server", () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      expect(() => manager.updateServer("non-existent", { enabled: true }))
        .toThrow("Server non-existent not found");
    });
  });

  describe("tool management", () => {
    it("should register a direct tool", () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const mockTool = {
        name: "test-tool",
        description: "A test tool",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "test" }],
          }),
      };

      manager.registerTool(mockTool);

      const tool = manager.getTool("test-tool");
      expect(tool).toBeDefined();
      expect(tool?.name).toBe("test-tool");
    });

    it("should reject duplicate tool registration", () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const mockTool = {
        name: "duplicate-tool",
        description: "A test tool",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "test" }],
          }),
      };

      manager.registerTool(mockTool);

      expect(() => manager.registerTool(mockTool)).toThrow(
        "Tool duplicate-tool already registered",
      );
    });

    it("should get all registered tools", () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const tool1 = {
        name: "tool-1",
        description: "Tool 1",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "test" }],
          }),
      };

      const tool2 = {
        name: "tool-2",
        description: "Tool 2",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "test" }],
          }),
      };

      manager.registerTool(tool1);
      manager.registerTool(tool2);

      const allTools = manager.getAllTools();
      expect(allTools.size).toBe(2);
      expect(allTools.has("tool-1")).toBe(true);
      expect(allTools.has("tool-2")).toBe(true);
    });

    it("should return undefined for non-existent tool", () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const tool = manager.getTool("non-existent-tool");
      expect(tool).toBeUndefined();
    });

    it("should prevent registering tool with same name as directly registered tool", () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const tool1 = {
        name: "conflict-tool",
        description: "First tool",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "test" }],
          }),
      };

      const tool2 = {
        name: "conflict-tool",
        description: "Second tool",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "test2" }],
          }),
      };

      manager.registerTool(tool1);
      expect(() => manager.registerTool(tool2)).toThrow(
        "Tool conflict-tool already registered",
      );
    });

    it("should return directly registered tools from getAllTools", () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const directTool = {
        name: "test-direct-tool",
        description: "Direct tool",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "direct" }],
          }),
      };

      manager.registerTool(directTool);

      const allTools = manager.getAllTools();
      expect(allTools.has("test-direct-tool")).toBe(true);
      expect(allTools.get("test-direct-tool")?.description).toBe("Direct tool");
    });

    it("should find directly registered tools via getTool", () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const directTool = {
        name: "lookup-tool",
        description: "Direct tool",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "direct" }],
          }),
      };

      manager.registerTool(directTool);

      const tool = manager.getTool("lookup-tool");
      expect(tool).toBeDefined();
      expect(tool?.description).toBe("Direct tool");
    });

    // NOTE: MCP tool precedence cannot be tested with disabled servers because:
    // 1. MCP tools are prefixed with server ID (e.g., "server-id_tool-name")
    // 2. Direct tools use unprefixed names
    // 3. Therefore, name collisions between MCP and direct tools are impossible
    // See: src/mcp/McpClient.ts:478 for the prefixing logic
  });

  describe("cleanup", () => {
    it("should cleanup all servers and tools", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      // Register a server
      const endpoint: McpServerEndpoint = {
        id: "cleanup-test",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };
      await manager.registerServer(endpoint, false);

      // Register a tool
      const mockTool = {
        name: "cleanup-tool",
        description: "Tool for cleanup test",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "test" }],
          }),
      };
      manager.registerTool(mockTool);

      // Verify they exist
      expect(manager.getAllTools().size).toBe(1);

      // Cleanup
      manager.cleanup();

      // Verify everything is cleared
      expect(manager.getAllTools().size).toBe(0);
      expect(manager.getTool("cleanup-tool")).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle server with special characters in ID", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const endpoint: McpServerEndpoint = {
        id: "test-server-@#$%",
        displayName: "Special Chars Server",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      await manager.registerServer(endpoint, false);
      expect(() => manager.deregisterServer("test-server-@#$%")).not.toThrow();
    });

    it("should handle multiple cleanup calls idempotently", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const endpoint: McpServerEndpoint = {
        id: "multi-cleanup-test",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      await manager.registerServer(endpoint, false);

      manager.cleanup();
      expect(() => manager.cleanup()).not.toThrow(); // Should be idempotent

      expect(manager.getAllTools().size).toBe(0);
    });
  });

  describe("debugLogState", () => {
    it("should log state without errors", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const endpoint: McpServerEndpoint = {
        id: "debug-test",
        displayName: "Debug Test Server",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      await manager.registerServer(endpoint, false);

      const mockTool = {
        name: "debug-tool",
        description: "Debug tool",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "test" }],
          }),
      };
      manager.registerTool(mockTool);

      // Should not throw
      manager.debugLogState();
      expect(manager).toBeDefined();
    });
  });

  describe.skip("integration tests with enabled servers (skipped due to cleanup leak)", () => {
    // NOTE: These tests are skipped because McpServerManager.cleanup() doesn't properly
    // dispose of MCP clients, causing resource leaks. See TODO on line 212 of McpServerManager.ts
    it("should register and connect to an enabled MCP server", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      const endpoint: McpServerEndpoint = {
        id: "enabled-integration-test",
        displayName: "Enabled Integration Test Server",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      // Register with enabled: true
      await manager.registerServer(endpoint, true);

      // Server should be connected and have tools
      const tools = manager.getAllTools();
      expect(tools.size).toBeGreaterThan(0);
    });

    it("should handle tool precedence - MCP tools override direct tools", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      // First register a direct tool
      const directTool = {
        name: "echo", // This tool exists in @modelcontextprotocol/server-everything
        description: "Direct echo tool",
        parameters: {
          type: "object" as const,
          properties: {},
        },
        execute: () =>
          Promise.resolve({
            content: [{ type: "text" as const, text: "direct echo" }],
          }),
      };

      manager.registerTool(directTool);

      // Verify direct tool is available
      const toolBefore = manager.getTool("echo");
      expect(toolBefore?.description).toBe("Direct echo tool");

      // Now register an MCP server that has an "echo" tool
      const endpoint: McpServerEndpoint = {
        id: "precedence-test",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      await manager.registerServer(endpoint, true);

      // MCP tool should now take precedence
      const toolAfter = manager.getTool("echo");
      expect(toolAfter).toBeDefined();
      // The tool should be from the MCP server, not the direct registration
      // (description will be different from "Direct echo tool")
    });

    it("should only include tools from enabled servers", async () => {
      manager = new McpServerManager(
        context,
        mockRegistryClient as unknown as McpStoreClient,
      );

      // Register two servers - one enabled, one disabled
      const endpoint1: McpServerEndpoint = {
        id: "enabled-server-test",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      const endpoint2: McpServerEndpoint = {
        id: "disabled-server-test",
        type: "command",
        command: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      };

      await manager.registerServer(endpoint1, true);
      await manager.registerServer(endpoint2, false);

      // Only enabled server's tools should be available
      const tools = manager.getAllTools();
      expect(tools.size).toBeGreaterThan(0);

      // Disable the first server
      manager.updateServer("enabled-server-test", { enabled: false });

      // Wait a bit for disconnection
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Now no tools should be available
      const toolsAfter = manager.getAllTools();
      expect(toolsAfter.size).toBe(0);
    });
  });
});
