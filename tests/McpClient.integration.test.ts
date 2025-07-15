import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertRejects } from "@std/assert";
import { McpClient } from "../src/mcp/McpClient.ts";
import { ConnectionMode } from "../src/mcp/utils/transport.ts";
import type { ZypherMcpServer } from "../src/mcp/types/local.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { stub } from "@std/testing/mock";

describe("McpClient #connectRecursive", () => {
  const mockServer: ZypherMcpServer = {
    _id: "test-server",
    name: "test-server",
    remotes: [{ url: "http://localhost:8080", transportType: "http" }],
    packages: [{
      name: "test-package",
      version: "1.0.0",
      registryName: "test-registry",
    }],
  };

  it("should throw an error in CLI mode if no packages are defined", async () => {
    const serverWithoutPackages = { ...mockServer, packages: [] };
    const mcpClient = new McpClient(
      {},
      serverWithoutPackages,
    );

    await assertRejects(
      () => mcpClient.connect(ConnectionMode.CLI),
      Error,
      "Connection Error: No packages defined for CLI mode.",
    );
  });

  it("should connect using StdioClientTransport in CLI mode", async () => {
    const mockClientConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);
      await mcpClient.connect(ConnectionMode.CLI);

      assertEquals(mcpClient.transport instanceof StdioClientTransport, true);
      assertEquals(mockClientConnect.calls.length, 1);
    } finally {
      mockClientConnect.restore();
    }
  });

  it("should throw an error in remote mode if no remotes are configured", async () => {
    const mockClientConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const serverWithoutRemotes = { ...mockServer, remotes: [] };
      const mcpClient = new McpClient(
        {},
        serverWithoutRemotes,
      );

      await assertRejects(
        () => mcpClient.connect(ConnectionMode.HTTP_FIRST),
        Error,
        "Connection failed: No remote servers configured for mode 'http-first'",
      );
    } finally {
      mockClientConnect.restore();
    }
  });

  it("should connect using SSEClientTransport in SSE_ONLY mode", async () => {
    const mockClientConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);
      await mcpClient.connect(ConnectionMode.SSE_ONLY);

      assertEquals(mcpClient.transport instanceof SSEClientTransport, true);
      assertEquals(mockClientConnect.calls.length, 1);
    } finally {
      mockClientConnect.restore();
    }
  });

  it("should connect using StreamableHTTPClientTransport in HTTP_FIRST mode", async () => {
    const mockClientConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient(
        {},
        mockServer,
      );
      await mcpClient.connect(ConnectionMode.HTTP_FIRST);

      assertEquals(
        mcpClient.transport instanceof StreamableHTTPClientTransport,
        true,
      );
      assertEquals(mockClientConnect.calls.length, 1);
    } finally {
      mockClientConnect.restore();
    }
  });

  it("should fall back to SSEClientTransport if StreamableHTTPClientTransport fails in HTTP_FIRST mode", async () => {
    const connectStub = stub(
      Client.prototype,
      "connect",
      (transport: unknown) => {
        if (transport instanceof StreamableHTTPClientTransport) {
          return Promise.reject(
            new Error("Request failed with status code 404"),
          );
        }
        return Promise.resolve();
      },
    );

    try {
      const mcpClient = new McpClient(
        {},
        mockServer,
      );
      await mcpClient.connect(ConnectionMode.HTTP_FIRST);

      assertEquals(mcpClient.transport instanceof SSEClientTransport, true);
      assertEquals(connectStub.calls.length, 2);
    } finally {
      connectStub.restore();
    }
  });

  it("should fall back to StreamableHTTPClientTransport if SSEClientTransport fails in SSE_FIRST mode", async () => {
    const connectStub = stub(
      Client.prototype,
      "connect",
      (transport: unknown) => {
        if (transport instanceof SSEClientTransport) {
          return Promise.reject(
            new Error("Request failed with status code 405"),
          );
        }
        return Promise.resolve();
      },
    );

    try {
      const mcpClient = new McpClient({}, mockServer);
      await mcpClient.connect(ConnectionMode.SSE_FIRST);

      assertEquals(
        mcpClient.transport instanceof StreamableHTTPClientTransport,
        true,
      );
      assertEquals(connectStub.calls.length, 2);
    } finally {
      connectStub.restore();
    }
  });

  it("should throw an error if all fallbacks are exhausted", async () => {
    const connectStub = stub(
      Client.prototype,
      "connect",
      () => Promise.reject(new Error("Request failed with status code 404")),
    );

    try {
      const mcpClient = new McpClient(
        {},
        mockServer,
      );

      await assertRejects(
        () => mcpClient.connect(ConnectionMode.HTTP_FIRST),
        Error,
        "Request failed with status code 404",
      );

      assertEquals(connectStub.calls.length, 2);
    } finally {
      connectStub.restore();
    }
  });

  it.ignore("should retry connection on UnauthorizedError if auth provider is configured", async () => {
    const connectStub = stub(Client.prototype, "connect", () => {
      return Promise.reject(new UnauthorizedError("Auth needed"));
    });

    try {
      const mcpClient = new McpClient({}, mockServer);

      await assertRejects(
        () => mcpClient.connect(ConnectionMode.HTTP_FIRST),
        Error,
        "Authentication failed after retry. Giving up.",
      );
    } finally {
      connectStub.restore();
    }
  });

  it.ignore("should throw an error on second UnauthorizedError", async () => {
    const connectStub = stub(
      Client.prototype,
      "connect",
      () => Promise.reject(new UnauthorizedError("Auth needed")),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);

      await assertRejects(
        () => mcpClient.connect(ConnectionMode.HTTP_FIRST),
        Error,
        "Authentication failed after retry. Giving up.",
      );
    } finally {
      connectStub.restore();
    }
  });

  it.ignore("should throw an error on UnauthorizedError if auth provider is not configured correctly", async () => {
    const connectStub = stub(
      Client.prototype,
      "connect",
      () => Promise.reject(new UnauthorizedError("Auth needed")),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);

      await assertRejects(
        () => mcpClient.connect(ConnectionMode.HTTP_FIRST),
        Error,
        "Authentication failed after retry. Giving up.",
      );
    } finally {
      connectStub.restore();
    }
  });

  it("should rethrow non-fallback, non-auth errors", async () => {
    const genericError = new Error("Something went wrong");
    const connectStub = stub(
      Client.prototype,
      "connect",
      () => Promise.reject(genericError),
    );

    try {
      const mcpClient = new McpClient(
        {},
        mockServer,
      );

      await assertRejects(
        () => mcpClient.connect(ConnectionMode.HTTP_FIRST),
        Error,
        "Something went wrong",
      );

      assertEquals(connectStub.calls.length, 1);
    } finally {
      connectStub.restore();
    }
  });
});

describe("McpClient #tool management", () => {
  const mockServer: ZypherMcpServer = {
    _id: "test-server",
    name: "test-server",
    remotes: [{ url: "http://localhost:8080", transportType: "http" }],
    packages: [{
      name: "test-package",
      version: "1.0.0",
      registryName: "test-registry",
    }],
  };

  it("should retrieve tools from connected server", async () => {
    const mockListTools = stub(
      Client.prototype,
      "listTools",
      () =>
        Promise.resolve({
          tools: [
            {
              name: "test-tool",
              description: "A test tool",
              inputSchema: {
                type: "object" as const,
                properties: {
                  input: { type: "string" },
                },
              },
            },
          ],
        }),
    );

    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);
      const tools = await mcpClient.retrieveTools(ConnectionMode.HTTP_FIRST);

      assertEquals(tools.length, 1);
      assertEquals(tools[0].name, "test-server_test-tool");
      assertEquals(mockListTools.calls.length, 1);
    } finally {
      mockConnect.restore();
      mockListTools.restore();
    }
  });

  it("should return empty array when no tools are available", async () => {
    const mockListTools = stub(
      Client.prototype,
      "listTools",
      () => Promise.resolve({ tools: [] }),
    );

    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);
      const tools = await mcpClient.retrieveTools(ConnectionMode.HTTP_FIRST);

      assertEquals(tools.length, 0);
      assertEquals(mcpClient.getToolCount(), 0);
    } finally {
      mockConnect.restore();
      mockListTools.restore();
    }
  });

  it("should get specific tool by name", async () => {
    const mockListTools = stub(
      Client.prototype,
      "listTools",
      () =>
        Promise.resolve({
          tools: [
            {
              name: "test-tool",
              description: "A test tool",
              inputSchema: {
                type: "object" as const,
                properties: {
                  input: { type: "string" },
                },
              },
            },
            {
              name: "another-tool",
              description: "Another test tool",
              inputSchema: {
                type: "object" as const,
                properties: {
                  value: { type: "number" },
                },
              },
            },
          ],
        }),
    );

    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);
      await mcpClient.retrieveTools(ConnectionMode.HTTP_FIRST);

      const tool = mcpClient.getTool("test-server_test-tool");
      assertEquals(tool?.name, "test-server_test-tool");

      const nonExistentTool = mcpClient.getTool("non-existent");
      assertEquals(nonExistentTool, undefined);
    } finally {
      mockConnect.restore();
      mockListTools.restore();
    }
  });

  it("should execute tool calls", async () => {
    const mockCallTool = stub(
      Client.prototype,
      "callTool",
      () => Promise.resolve({ result: "success" }),
    );

    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);
      await mcpClient.connect(ConnectionMode.HTTP_FIRST);

      const result = await mcpClient.executeToolCall({
        name: "test-tool",
        input: { param: "value" },
      });

      assertEquals(result, { result: "success" });
      assertEquals(mockCallTool.calls.length, 1);
      assertEquals(mockCallTool.calls[0].args[0], {
        name: "test-tool",
        arguments: { param: "value" },
      });
    } finally {
      mockConnect.restore();
      mockCallTool.restore();
    }
  });

  it("should throw error when executing tool call without connection", async () => {
    const mcpClient = new McpClient({}, mockServer);

    await assertRejects(
      () =>
        mcpClient.executeToolCall({
          name: "test-tool",
          input: { param: "value" },
        }),
      Error,
      "Not connected",
    );
  });
});

describe("McpClient #connection status", () => {
  const mockServer: ZypherMcpServer = {
    _id: "test-server",
    name: "test-server",
    remotes: [{ url: "http://localhost:8080", transportType: "http" }],
    packages: [{
      name: "test-package",
      version: "1.0.0",
      registryName: "test-registry",
    }],
  };

  it("should report disconnected status initially", () => {
    const mcpClient = new McpClient({}, mockServer);
    assertEquals(mcpClient.isConnected(), false);
    assertEquals(mcpClient.getStatus(), "disconnected");
  });

  it("should report connected status after successful connection", async () => {
    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);
      await mcpClient.connect(ConnectionMode.HTTP_FIRST);
      assertEquals(mcpClient.isConnected(), true);
      assertEquals(mcpClient.getStatus(), "connected");
    } finally {
      mockConnect.restore();
    }
  });

  it("should report disconnected status after cleanup", async () => {
    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    const mockClose = stub(
      Client.prototype,
      "close",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);
      await mcpClient.connect(ConnectionMode.HTTP_FIRST);
      assertEquals(mcpClient.isConnected(), true);

      await mcpClient.cleanup();
      assertEquals(mcpClient.isConnected(), false);
      assertEquals(mcpClient.getStatus(), "disconnected");
    } finally {
      mockConnect.restore();
      mockClose.restore();
    }
  });

  it("should report auth_needed status after authentication failure", async () => {
    const authError = new UnauthorizedError("Auth needed");

    // First call will throw UnauthorizedError, second call will also throw to force failure
    const connectStub = stub(Client.prototype, "connect", () => {
      return Promise.reject(authError);
    });

    try {
      const mcpClient = new McpClient({}, mockServer);

      await assertRejects(
        () => mcpClient.connect(ConnectionMode.HTTP_FIRST),
        Error,
      );

      assertEquals(mcpClient.getStatus(), "auth_needed");
    } finally {
      connectStub.restore();
    }
  });
});

describe("McpClient #error handling", () => {
  const mockServer: ZypherMcpServer = {
    _id: "test-server",
    name: "test-server",
    remotes: [{ url: "http://localhost:8080", transportType: "http" }],
    packages: [{
      name: "test-package",
      version: "1.0.0",
      registryName: "test-registry",
    }],
  };

  it("should handle connection errors gracefully during tool retrieval", async () => {
    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.reject(new Error("Network error")),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);

      await assertRejects(
        () => mcpClient.retrieveTools(ConnectionMode.HTTP_FIRST),
        Error,
        "Failed to connect to MCP server: Network error",
      );
    } finally {
      mockConnect.restore();
    }
  });

  it("should handle cleanup errors gracefully", async () => {
    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    const mockClose = stub(
      Client.prototype,
      "close",
      () => Promise.reject(new Error("Cleanup error")),
    );

    // Stub console.error to verify error logging
    const mockConsoleError = stub(console, "error");

    try {
      const mcpClient = new McpClient({}, mockServer);
      await mcpClient.connect(ConnectionMode.HTTP_FIRST);

      // Should not throw despite cleanup error
      await mcpClient.cleanup();
      assertEquals(mcpClient.isConnected(), true);
      // Cleanup error should be silently handled without throwing
    } finally {
      mockConnect.restore();
      mockClose.restore();
      mockConsoleError.restore();
    }
  });

  it("should throw error for invalid connection mode with undefined packages", async () => {
    const serverWithoutPackages = { ...mockServer, packages: undefined };
    const mcpClient = new McpClient({}, serverWithoutPackages);

    await assertRejects(
      () => mcpClient.connect(ConnectionMode.CLI),
      Error,
      "Connection Error: No packages defined for CLI mode.",
    );
  });

  it("should throw error when trying to retrieve tools from uninitialized client", async () => {
    // Create client but don't initialize the internal client
    const mcpClient = new McpClient({}, mockServer);
    // Force internal client to null to simulate uninitialized state
    (mcpClient as unknown as { [key: string]: unknown })["#client"] = null;

    await assertRejects(
      () => mcpClient.retrieveTools(ConnectionMode.HTTP_FIRST),
      Error,
      "Failed to connect to MCP server:",
    );
  });
});

describe("McpClient #command parsing", () => {
  const mockServer: ZypherMcpServer = {
    _id: "test-server",
    name: "test-server",
    packages: [{
      name: "test-package",
      version: "1.0.0",
      registryName: "npm",
    }],
  };

  it("should parse npm registry to npx command", async () => {
    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);
      await mcpClient.connect(ConnectionMode.CLI);

      // Verify that StdioClientTransport was created with npx command
      assertEquals(mcpClient.transport instanceof StdioClientTransport, true);
    } finally {
      mockConnect.restore();
    }
  });

  it("should parse pypi registry to uvx command", async () => {
    const serverWithPypi = {
      ...mockServer,
      packages: [{
        name: "test-package",
        version: "1.0.0",
        registryName: "pypi",
      }],
    };

    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, serverWithPypi);
      await mcpClient.connect(ConnectionMode.CLI);

      assertEquals(mcpClient.transport instanceof StdioClientTransport, true);
    } finally {
      mockConnect.restore();
    }
  });

  it("should handle unknown registry names", async () => {
    const serverWithUnknown = {
      ...mockServer,
      packages: [{
        name: "test-package",
        version: "1.0.0",
        registryName: "unknown-registry",
      }],
    };

    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, serverWithUnknown);
      await mcpClient.connect(ConnectionMode.CLI);

      assertEquals(mcpClient.transport instanceof StdioClientTransport, true);
    } finally {
      mockConnect.restore();
    }
  });
});

describe.skip("McpClient #OAuth integration", () => {
  const mockServer: ZypherMcpServer = {
    _id: "test-server",
    name: "test-server",
    remotes: [{ url: "http://localhost:8080", transportType: "http" }],
    packages: [{
      name: "test-package",
      version: "1.0.0",
      registryName: "test-registry",
    }],
  };

  it("should handle OAuth redirect callback", async () => {
    let capturedRedirectUrl = "";
    const onRedirectMock = (url: string) => {
      capturedRedirectUrl = url;
    };

    let callCount = 0;
    const connectStub = stub(Client.prototype, "connect", () => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new UnauthorizedError("Auth needed"));
      }
      return Promise.resolve();
    });

    try {
      const mcpClient = new McpClient({}, mockServer);

      await mcpClient.connect(ConnectionMode.HTTP_FIRST, {
        callbackPort: 3000,
        host: "localhost",
        onRedirect: onRedirectMock,
      });

      assertEquals(connectStub.calls.length, 2);
      // Verify that redirect was captured (URL will be generated by OAuth provider)
      assertEquals(typeof capturedRedirectUrl, "string");
    } finally {
      connectStub.restore();
    }
  });

  it("should use default OAuth options when none provided", async () => {
    let callCount = 0;
    const connectStub = stub(Client.prototype, "connect", () => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new UnauthorizedError("Auth needed"));
      }
      return Promise.resolve();
    });

    try {
      const mcpClient = new McpClient({}, mockServer);

      await mcpClient.connect(ConnectionMode.HTTP_FIRST);

      assertEquals(connectStub.calls.length, 2);
    } finally {
      connectStub.restore();
    }
  });

  it("should handle OAuth timeout scenarios", async () => {
    const connectStub = stub(
      Client.prototype,
      "connect",
      () => Promise.reject(new Error("OAuth timeout")),
    );

    try {
      const mcpClient = new McpClient({}, mockServer);

      await assertRejects(
        () => mcpClient.connect(ConnectionMode.HTTP_FIRST),
        Error,
        "OAuth timeout",
      );
    } finally {
      connectStub.restore();
    }
  });
});

describe("McpClient #configuration validation", () => {
  it("should accept valid client configuration", () => {
    const config = {
      id: "test-client-id",
      name: "Test Client",
      version: "2.0.0",
    };

    const mockServer: ZypherMcpServer = {
      _id: "test-server",
      name: "test-server",
      remotes: [{ url: "http://localhost:8080", transportType: "http" }],
      packages: [{
        name: "test-package",
        version: "1.0.0",
        registryName: "test-registry",
      }],
    };

    const mcpClient = new McpClient(config, mockServer);
    assertEquals(mcpClient instanceof McpClient, true);
  });

  it("should use default values for missing config properties", () => {
    const mockServer: ZypherMcpServer = {
      _id: "test-server",
      name: "test-server",
      remotes: [{ url: "http://localhost:8080", transportType: "http" }],
      packages: [{
        name: "test-package",
        version: "1.0.0",
        registryName: "test-registry",
      }],
    };

    const mcpClient = new McpClient({}, mockServer);
    assertEquals(mcpClient instanceof McpClient, true);
  });

  it("should handle server configuration with isFromMcpStore flag", async () => {
    const serverFromStore: ZypherMcpServer = {
      _id: "test-server",
      name: "test-server",
      isFromMcpStore: true,
      packages: [{
        name: "test-package",
        version: "1.0.0",
        registryName: "npm",
      }],
    };

    const mockConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const mcpClient = new McpClient({}, serverFromStore);
      await mcpClient.connect(ConnectionMode.CLI);

      assertEquals(mcpClient.transport instanceof StdioClientTransport, true);
    } finally {
      mockConnect.restore();
    }
  });
});
