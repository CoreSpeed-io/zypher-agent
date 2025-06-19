import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertRejects } from "@std/assert";
import { type IMcpClientConfig, McpClient } from "../src/mcp/McpClient.ts";
import { ConnectionMode } from "../src/mcp/utils/transport.ts";
import type { ZypherMcpServer } from "../src/mcp/types/local.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/StreamableHTTP.js";
import { stub } from "@std/testing/mock";
import {
  type OAuthClientProvider,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";

// Define a type for our mock provider to avoid using 'any'
interface MockAuthProvider {
  clearAuthData: () => Promise<void>;
  tokens: () => Promise<{ access_token: string }>;
  stopCallbackServer: () => Promise<void>;
}

describe("McpClient connection logic", () => {
  let mcpClient: McpClient;
  const mockServer: ZypherMcpServer = {
    _id: "test-server",
    name: "test-server",
    remotes: [{
      url: "http://localhost:8080",
      transportType: "streamablehttp",
    }],
    packages: [{
      name: "test-package",
      version: "1.0.0",
      registryName: "test-registry",
      packageArguments: [],
      environmentVariables: [],
    }],
  };
  const mockConfig: IMcpClientConfig = { name: "test-client" };

  describe("CLI Connection", () => {
    it("should prepare a StdioClientTransport for CLI mode", async () => {
      const mockClientConnect = stub(
        Client.prototype,
        "connect",
        () => Promise.resolve(),
      );
      try {
        mcpClient = new McpClient(mockConfig, mockServer, ConnectionMode.CLI);
        await mcpClient.connect();
        assertEquals(mcpClient.transport instanceof StdioClientTransport, true);
        assertEquals(mockClientConnect.calls.length, 1);
      } finally {
        mockClientConnect.restore();
      }
    });
  });

  describe("Remote Connections", () => {
    it("should connect with SSEClientTransport on SSE_FIRST", async () => {
      const mockClientConnect = stub(
        Client.prototype,
        "connect",
        () => Promise.resolve(),
      );
      try {
        mcpClient = new McpClient(
          mockConfig,
          mockServer,
          ConnectionMode.SSE_FIRST,
        );
        await mcpClient.connect();
        assertEquals(mcpClient.transport instanceof SSEClientTransport, true);
        assertEquals(mockClientConnect.calls.length, 1);
      } finally {
        mockClientConnect.restore();
      }
    });

    it("should connect with StreamableHTTPClientTransport on HTTP_FIRST", async () => {
      const mockClientConnect = stub(
        Client.prototype,
        "connect",
        () => Promise.resolve(),
      );
      try {
        mcpClient = new McpClient(
          mockConfig,
          mockServer,
          ConnectionMode.HTTP_FIRST,
        );
        await mcpClient.connect();
        assertEquals(
          mcpClient.transport instanceof StreamableHTTPClientTransport,
          true,
        );
        assertEquals(mockClientConnect.calls.length, 1);
      } finally {
        mockClientConnect.restore();
      }
    });

    it("should fall back to HTTP when SSE fails for SSE_FIRST mode", async () => {
      const connectStub = stub(
        Client.prototype,
        "connect",
        (transport: unknown) => {
          if (transport instanceof SSEClientTransport) {
            return Promise.reject(new Error("404 Not Found"));
          }
          return Promise.resolve();
        },
      );

      try {
        mcpClient = new McpClient(
          mockConfig,
          mockServer,
          ConnectionMode.SSE_FIRST,
        );
        await mcpClient.connect();
        assertEquals(
          mcpClient.transport instanceof StreamableHTTPClientTransport,
          true,
          "Should have fallen back to HTTP transport",
        );
        assertEquals(connectStub.calls.length, 2);
      } finally {
        connectStub.restore();
      }
    });

    it("should fall back to SSE when HTTP fails for HTTP_FIRST mode", async () => {
      const connectStub = stub(
        Client.prototype,
        "connect",
        (transport: unknown) => {
          if (transport instanceof StreamableHTTPClientTransport) {
            return Promise.reject(new Error("404 Not Found"));
          }
          return Promise.resolve();
        },
      );

      try {
        mcpClient = new McpClient(
          mockConfig,
          mockServer,
          ConnectionMode.HTTP_FIRST,
        );
        await mcpClient.connect();
        assertEquals(
          mcpClient.transport instanceof SSEClientTransport,
          true,
          "Should have fallen back to SSE transport",
        );
        assertEquals(connectStub.calls.length, 2);
      } finally {
        connectStub.restore();
      }
    });

    it("should throw an error if fallback also fails", async () => {
      const connectStub = stub(
        Client.prototype,
        "connect",
        () => Promise.reject(new Error("404 Not Found")),
      );

      try {
        await assertRejects(
          async () => {
            mcpClient = new McpClient(
              mockConfig,
              mockServer,
              ConnectionMode.SSE_FIRST,
            );
            await mcpClient.connect();
          },
          Error,
          "404 Not Found",
        );
        assertEquals(connectStub.calls.length, 2);
      } finally {
        connectStub.restore();
      }
    });
  });

  describe("Authentication Handling", () => {
    it("should retry connection on UnauthorizedError", async () => {
      let callCount = 0;
      const connectStub = stub(Client.prototype, "connect", () => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new UnauthorizedError("Auth failed"));
        }
        return Promise.resolve();
      });

      const mockAuthProvider: MockAuthProvider = {
        clearAuthData: () => Promise.resolve(),
        tokens: () => Promise.resolve({ access_token: "test" }),
        stopCallbackServer: () => Promise.resolve(),
      };
      const clearAuthDataStub = stub(mockAuthProvider, "clearAuthData");

      try {
        mcpClient = new McpClient(
          mockConfig,
          mockServer,
          ConnectionMode.HTTP_ONLY,
        );
        mcpClient.authProvider =
          mockAuthProvider as unknown as OAuthClientProvider;
        await mcpClient.connect();
        assertEquals(connectStub.calls.length, 2);
        assertEquals(clearAuthDataStub.calls.length, 1);
      } finally {
        connectStub.restore();
        clearAuthDataStub.restore();
      }
    });

    it("should throw an error if authentication fails twice", async () => {
      const connectStub = stub(
        Client.prototype,
        "connect",
        () => Promise.reject(new UnauthorizedError("Auth failed")),
      );
      const mockAuthProvider: MockAuthProvider = {
        clearAuthData: () => Promise.resolve(),
        tokens: () => Promise.resolve({ access_token: "test" }),
        stopCallbackServer: () => Promise.resolve(),
      };
      const clearAuthDataStub = stub(mockAuthProvider, "clearAuthData");

      try {
        mcpClient = new McpClient(
          mockConfig,
          mockServer,
          ConnectionMode.HTTP_ONLY,
        );
        mcpClient.authProvider =
          mockAuthProvider as unknown as OAuthClientProvider;
        await assertRejects(
          () => mcpClient.connect(),
          Error,
          "Authentication failed after retry. Giving up.",
        );
        assertEquals(connectStub.calls.length, 2);
        assertEquals(clearAuthDataStub.calls.length, 1);
      } finally {
        connectStub.restore();
        clearAuthDataStub.restore();
      }
    });
  });
});
