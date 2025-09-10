/**
 * MCP Transport utilities for creating and connecting to different types of MCP servers
 */
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
  if ("command" in serverEndpoint && serverEndpoint.command) {
    return await connectToCliServer(
      client,
      serverEndpoint.command,
      { signal: options?.signal },
    );
  } else if ("remote" in serverEndpoint && serverEndpoint.remote) {
    return await connectToRemoteServer(
      client,
      serverEndpoint.remote,
      { signal: options?.signal },
    );
  } else {
    throw new Error(
      "Invalid server endpoint configuration: either command or remote is required",
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
  const commonEnvVars = ["PATH", "HOME", "SHELL", "TERM"];
  const filteredEnvVars = {
    ...Object.fromEntries(
      commonEnvVars
        .map((key) => [key, Deno.env.get(key)])
        .filter(([_, value]) => value !== null),
    ),
    LANG: Deno.env.get("LANG") || "en_US.UTF-8",
  };

  const env = {
    ...filteredEnvVars,
    ...commandConfig.env,
  };

  console.log("CLI transport config", commandConfig);

  const transport = new StdioClientTransport({
    command: commandConfig.command,
    args: commandConfig.args,
    env,
  });

  await client.connect(transport, { signal: options?.signal });
  console.log(`Connected using CLI transport: ${commandConfig.command}`);

  return transport;
}

/**
 * Connects to a remote MCP server using HTTP transport
 * @param client The MCP client instance
 * @param endpoint The server endpoint configuration
 * @param signal Optional abort signal for cancellation
 * @returns Promise that resolves when connected
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

  const transport = new StreamableHTTPClientTransport(
    mcpServerUrl,
    {
      authProvider: options?.oauth?.authProvider,
    },
  );

  try {
    await client.connect(transport, { signal: options?.signal });
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
      console.log("Authorization code:", authorizationCode);

      // Exchange the authorization code for an access token
      await transport.finishAuth(authorizationCode);

      // Retry the connection
      await connectToRemoteServer(client, remoteConfig, {
        signal: options?.signal,
        oauth: options.oauth,
      });
    } else {
      throw error;
    }
  }
  console.log(`Connected using HTTP transport: ${mcpServerUrl}`);

  return transport;
}
