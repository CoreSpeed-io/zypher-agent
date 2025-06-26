import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertRejects } from "@std/assert";
import { McpClient } from "../src/mcp/McpClient.ts";
import { ConnectionMode } from "../src/mcp/utils/transport.ts";
import type { ZypherMcpServer } from "../src/mcp/types/local.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/StreamableHTTP.js";
import {
  type OAuthClientProvider,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { stub } from "@std/testing/mock";
import type { McpOAuthClientProvider } from "../src/mcp/auth/McpOAuthClientProvider.ts";

// Define a type for our mock provider
interface MockAuthProvider extends OAuthClientProvider {
  clearAuthData: () => Promise<void>;
  stopCallbackServer: () => Promise<void>;
}

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
    const mockClientConnect = stub(
      Client.prototype,
      "connect",
      () => Promise.resolve(),
    );

    try {
      const serverWithoutPackages = { ...mockServer, packages: [] };
      const mcpClient = new McpClient(
        {},
        serverWithoutPackages,
      );

      await assertRejects(
        () => mcpClient.connect(),
        Error,
        "Connection Error: No packages defined for CLI mode.",
      );
    } finally {
      mockClientConnect.restore();
    }
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

  it("should retry connection on UnauthorizedError if auth provider is configured", async () => {
    let callCount = 0;
    const connectStub = stub(Client.prototype, "connect", () => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new UnauthorizedError("Auth needed"));
      }
      return Promise.resolve();
    });

    const mockAuthProvider: MockAuthProvider = {
      redirectUrl: "http://localhost/callback",
      clientMetadata: {
        client_name: "Test Client",
        redirect_uris: ["http://localhost/callback"],
      },
      clientInformation: () => ({ client_id: "test-client" }),
      tokens: () => ({
        access_token: "fake-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
      saveTokens: () => Promise.resolve(),
      redirectToAuthorization: () => Promise.resolve(),
      saveCodeVerifier: () => Promise.resolve(),
      codeVerifier: () => "fake-code-verifier",
      clearAuthData: () => Promise.resolve(),
      stopCallbackServer: () => Promise.resolve(),
    } as MockAuthProvider;

    try {
      const mcpClient = new McpClient(
        {},
        mockServer,
      );

      await mcpClient.connect(ConnectionMode.HTTP_FIRST, {
        authProvider: mockAuthProvider as unknown as McpOAuthClientProvider,
      });

      assertEquals(connectStub.calls.length, 2);
    } finally {
      connectStub.restore();
    }
  });

  it("should throw an error on second UnauthorizedError", async () => {
    const connectStub = stub(
      Client.prototype,
      "connect",
      () => Promise.reject(new UnauthorizedError("Auth needed")),
    );

    const mockAuthProvider: MockAuthProvider = {
      redirectUrl: "http://localhost/callback",
      clientMetadata: {
        client_name: "Test Client",
        redirect_uris: ["http://localhost/callback"],
      },
      clientInformation: () => ({ client_id: "test-client" }),
      tokens: () => ({
        access_token: "fake-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
      saveTokens: () => Promise.resolve(),
      redirectToAuthorization: () => Promise.resolve(),
      saveCodeVerifier: () => Promise.resolve(),
      codeVerifier: () => "fake-code-verifier",
      clearAuthData: () => Promise.resolve(),
      stopCallbackServer: () => Promise.resolve(),
    } as MockAuthProvider;

    try {
      const mcpClient = new McpClient(
        {},
        mockServer,
      );

      await assertRejects(
        () =>
          mcpClient.connect(ConnectionMode.HTTP_FIRST, {
            authProvider: mockAuthProvider as unknown as McpOAuthClientProvider,
          }),
        Error,
        "Authentication failed after retry. Giving up.",
      );

      assertEquals(connectStub.calls.length, 2);
    } finally {
      connectStub.restore();
    }
  });

  it("should throw an error on UnauthorizedError if auth provider is not configured correctly", async () => {
    const connectStub = stub(
      Client.prototype,
      "connect",
      () => Promise.reject(new UnauthorizedError("Auth needed")),
    );

    const baseAuthProvider: OAuthClientProvider = {
      redirectUrl: "http://localhost/callback",
      clientMetadata: {
        client_name: "Test Client",
        redirect_uris: ["http://localhost/callback"],
      },
      clientInformation: () => ({ client_id: "test-client" }),
      tokens: () => ({
        access_token: "fake-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
      saveTokens: () => Promise.resolve(),
      redirectToAuthorization: () => Promise.resolve(),
      saveCodeVerifier: () => Promise.resolve(),
      codeVerifier: () => "fake-code-verifier",
    };

    try {
      const mcpClient = new McpClient(
        {},
        mockServer,
      );

      await assertRejects(
        () =>
          mcpClient.connect(ConnectionMode.HTTP_FIRST, {
            authProvider: baseAuthProvider as unknown as McpOAuthClientProvider,
          }),
        Error,
        "Authentication failed: No OAuth provider with clearAuthData method is configured.",
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
