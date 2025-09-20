/**
 * MCP Transport utilities for creating and connecting to different types of MCP servers
 */
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  McpCommandConfig,
  McpRemoteConfig,
  McpServerEndpoint,
} from "./mod.ts";

/**
 * Interface for handling OAuth authorization callback
 */
export interface OAuthCallbackHandler {
  /**
   * Waits for the OAuth callback and returns the authorization code
   * The OAuthClientProvider is responsible for redirecting/showing the authorization URL
   * @returns Promise that resolves to the authorization code
   */
  waitForCallback(): Promise<string>;
}

/**
 * OAuth configuration options for remote server connections
 */
export interface OAuthOptions {
  /** OAuth client provider for handling authentication flow */
  authProvider: OAuthClientProvider;
  /** Handler for waiting for OAuth callback completion */
  callbackHandler: OAuthCallbackHandler;
}

/**
 * Connects to an MCP server using the appropriate transport based on endpoint configuration
 * @param client The MCP client instance
 * @param serverEndpoint The server endpoint configuration (either CLI or remote)
 * @param signal Optional abort signal for cancellation
 * @returns Promise that resolves to the transport when connected
 */
export async function connectToServer(
  client: Client,
  serverEndpoint: McpServerEndpoint,
  options?: {
    signal?: AbortSignal;
  },
): Promise<Transport> {
  // Connect using appropriate transport
  if (serverEndpoint.type === "command") {
    return await connectToCliServer(
      client,
      serverEndpoint.command,
      { signal: options?.signal },
    );
  } else {
    return await connectToRemoteServer(
      client,
      serverEndpoint.remote,
      { signal: options?.signal },
    );
  }
}

/**
 * Connects to a CLI-based MCP server using stdio transport
 * @param client The MCP client instance
 * @param endpoint The server endpoint configuration
 * @param signal Optional abort signal for cancellation
 * @returns Promise that resolves when connected
 */
export async function connectToCliServer(
  client: Client,
  commandConfig: McpCommandConfig,
  options?: {
    signal?: AbortSignal;
  },
): Promise<Transport> {
  console.log("CLI transport config", commandConfig);

  const transport = new StdioClientTransport({
    command: commandConfig.command,
    args: commandConfig.args,
    env: commandConfig.env,
  });

  await client.connect(transport, { signal: options?.signal });
  console.log(`Connected using CLI transport: ${commandConfig.command}`);

  return transport;
}

/**
 * Connects to a remote MCP server with automatic transport fallback
 *
 * Implements the MCP specification for backwards compatibility by attempting
 * multiple transport methods in sequence:
 * 1. First attempts StreamableHTTPClientTransport (modern streaming transport)
 * 2. If that fails with a 4xx HTTP error (excluding 401), falls back to SSEClientTransport
 *
 * Both transports support OAuth authentication when oauth options are provided.
 * If a 401 Unauthorized error occurs, the OAuth flow will be initiated automatically.
 *
 * @param client The MCP client instance
 * @param remoteConfig The remote server endpoint configuration
 * @param options Optional configuration including abort signal and OAuth settings
 * @returns Promise that resolves to the connected transport
 * @throws Error if connection fails on all transport attempts or OAuth is required but not provided
 */
export async function connectToRemoteServer(
  client: Client,
  remoteConfig: McpRemoteConfig,
  options?: {
    signal?: AbortSignal;
    oauth?: OAuthOptions;
  },
): Promise<Transport> {
  const mcpServerUrl = new URL(remoteConfig.url);

  console.log(`Connecting to remote MCP server: ${mcpServerUrl}`);

  // Following the MCP specification for backwards compatibility:
  // - Attempts to use StreamableHTTPClientTransport first
  // - If that fails with 4xx status, falls back to SSEClientTransport

  try {
    return await attemptToConnect(
      client,
      () =>
        new StreamableHTTPClientTransport(
          mcpServerUrl,
          {
            requestInit: {
              headers: remoteConfig.headers,
            },
            authProvider: options?.oauth?.authProvider,
          },
        ),
      options,
    );
  } catch (error) {
    if (is4xxError(error)) {
      console.warn(
        "Got 4xx error while trying to connect to remote MCP server with StreamableHTTPClientTransport",
        error,
      );
      console.warn("Falling back to SSE transport");
      // Fall back to SSE transport
      return await attemptToConnect(
        client,
        () =>
          new SSEClientTransport(
            mcpServerUrl,
            {
              requestInit: {
                headers: remoteConfig.headers,
              },
              authProvider: options?.oauth?.authProvider,
            },
          ),
        options,
      );
    } else {
      throw error;
    }
  }
}

/** Attempts to connect to the MCP server with the given transport and options */
async function attemptToConnect(
  client: Client,
  buildTransport: () => StreamableHTTPClientTransport | SSEClientTransport,
  options?: {
    signal?: AbortSignal;
    oauth?: OAuthOptions;
  },
): Promise<Transport> {
  const transport = buildTransport();
  try {
    await client.connect(transport, { signal: options?.signal });
    return transport;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      if (!options?.oauth) {
        throw new Error(
          "OAuth authentication required but no OAuth options provided",
        );
      }

      // Wait for the OAuth callback handler to complete the flow
      // The OAuth provider has already shown the authorization URL via redirectToAuthorization
      const authorizationCode = await options.oauth.callbackHandler
        .waitForCallback();

      // Exchange the authorization code for an access token so the next connection attempt will succeed
      await transport.finishAuth(authorizationCode);
      return await attemptToConnect(client, buildTransport, options);
    } else {
      throw error;
    }
  }
}

/**
 * Checks if an error indicates a 4xx HTTP status (server doesn't support modern
 * transport), excluding 401 unauthorized errors
 */
function is4xxError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message;
  // Match HTTP/http 4xx status codes excluding 401 (unauthorized)
  return /\bHTTP\s*4(?!01\b)\d{2}\b/i.test(message);
}
