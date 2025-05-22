/**
 * Model Context Protocol (MCP) Client Implementation
 *
 * This file implements a client for the Model Context Protocol, which enables
 * communication between language models (like Claude) and external tools.
 * The client manages:
 * - Connection to MCP servers
 * - Tool discovery and registration
 * - Query processing with tool execution
 * - Message history management
 * - OAuth authentication with MCP servers in server-to-server contexts
 *
 * The implementation uses:
 * - Anthropic's Claude API for LLM interactions
 * - MCP SDK for tool communication
 * - StdioClientTransport for CLI server communication
 * - SSEClientTransport with OAuth for HTTP server communication
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createTool, type Tool } from "../tools/mod.ts";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  auth,
  OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { z } from "zod";
import type { IMcpServerConfig } from "./types.ts";

/**
 * Interface for an OAuth provider with clearAuthData method
 */
interface OAuthProviderWithClear extends OAuthClientProvider {
  clearAuthData(): Promise<void>;
}

/**
 * Configuration options for the MCP client
 */
export interface IMcpClientConfig {
  /** Optional client name for identification */
  name?: string;
  /** Optional version string */
  version?: string;
  /** Optional server name */
  serverName?: string;
  /** Optional OAuth provider for authentication */
  oauthProvider?: OAuthClientProvider;
  /** Optional setting to retry authentication on failure */
  retryAuthentication?: boolean;
  /** Max number of authentication retries */
  maxAuthRetries?: number;
}

export enum ConnectionMode {
  CLI = 1,
  SSE = 2,
}

/**
 * MCPClient handles communication with MCP servers and tool execution
 */
export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  private config: IMcpClientConfig & {
    name: string;
    version: string;
    serverName: string;
    retryAuthentication: boolean;
    maxAuthRetries: number;
  };
  private authProvider?: OAuthClientProvider;
  private serverUrl?: URL;
  private authRetryCount: number = 0;

  /**
   * Creates a new MCPClient instance
   * @param config Optional configuration for the client
   */
  constructor(config: IMcpClientConfig = {}) {
    this.config = {
      name: config.name ?? "mcp-client",
      version: config.version ?? "1.0.0",
      serverName: config.serverName ?? "default-server",
      retryAuthentication: config.retryAuthentication ?? true,
      maxAuthRetries: config.maxAuthRetries ?? 3,
      ...config,
    };

    this.authProvider = config.oauthProvider;

    this.client = new Client(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {},
    );
  }

  /**
   * Connects to an MCP server and discovers available tools
   * @param config Configuration for the server connection
   * @param mode Connection mode (CLI or SSE)
   * @returns Promise resolving to the list of available tools
   * @throws Error if connection fails or server is not responsive
   */
  async retrieveTools(
    config: IMcpServerConfig,
    mode: ConnectionMode = ConnectionMode.CLI,
  ): Promise<Tool[]> {
    try {
      if (!this.client) {
        throw new Error("Client is not initialized");
      }

      this.transport = this.buildTransport(mode, config);
      this.authRetryCount = 0; // Reset auth retry count for new connection attempt

      // Try to connect with authentication retries if needed
      await this.connectWithRetry(mode, config);

      // Once connected, discover tools
      console.log("Connected to MCP server, discovering tools...");
      const toolResult = await this.client.listTools();
      console.log(`Discovered ${toolResult.tools.length} tools from server`);

      // Convert MCP tools to our internal tool format
      const tools = toolResult.tools.map((tool) => {
        const inputSchema = jsonToZod(tool.inputSchema);
        return createTool(
          `mcp_${this.config.serverName}_${tool.name}`,
          tool.description ?? "",
          inputSchema,
          async (params: Record<string, unknown>) => {
            const result = await this.executeToolCall({
              name: tool.name,
              input: params,
            });
            return JSON.stringify(result);
          },
        );
      });

      return tools;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Unknown error";
      throw new Error(`Failed to connect to MCP server: ${errorMessage}`);
    }
  }

  /**
   * Attempts to connect to the MCP server with authentication retries
   * @param mode Connection mode (CLI or SSE)
   * @param config Server configuration
   */
  private async connectWithRetry(
    mode: ConnectionMode,
    config: IMcpServerConfig,
  ): Promise<void> {
    if (!this.client || !this.transport) {
      throw new Error("Client or transport not initialized");
    }

    try {
      await this.client.connect(this.transport);
    } catch (error) {
      // If authentication error and we have an OAuth provider, try to refresh credentials
      if (
        this.isAuthenticationError(error) &&
        this.authProvider &&
        this.serverUrl &&
        this.config.retryAuthentication &&
        this.authRetryCount < this.config.maxAuthRetries
      ) {
        this.authRetryCount++;
        console.log(
          `Authentication failed. Retry attempt ${this.authRetryCount}/${this.config.maxAuthRetries}`,
        );

        await this.forceFetchCredentials();

        // For SSE connections, we need to recreate the transport with fresh credentials
        if (mode === ConnectionMode.SSE && "url" in config) {
          this.transport = this.buildTransport(mode, config);
          return await this.connectWithRetry(mode, config);
        }
      }

      // If not an auth error or we've exhausted retries, propagate the error
      throw error;
    }
  }

  /**
   * Executes a tool call and returns the result
   * @param toolCall The tool call to execute
   * @returns The result of the tool execution
   * @throws Error if client is not connected
   */
  async executeToolCall(toolCall: {
    name: string;
    input: Record<string, unknown>;
  }): Promise<unknown> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    try {
      const result = await this.client.callTool({
        name: toolCall.name,
        arguments: toolCall.input,
      });
      return result;
    } catch (error) {
      // If the error is due to authentication, try to reauthenticate and retry
      if (
        this.isAuthenticationError(error) &&
        this.authProvider &&
        this.serverUrl &&
        this.config.retryAuthentication &&
        this.authRetryCount < this.config.maxAuthRetries
      ) {
        console.log(
          "Authentication error during tool execution, refreshing credentials...",
        );

        // Try to refresh credentials
        try {
          await this.forceFetchCredentials();

          // Retry the tool call with fresh credentials
          const result = await this.client.callTool({
            name: toolCall.name,
            arguments: toolCall.input,
          });

          // Reset retry counter on success
          this.authRetryCount = 0;

          return result;
        } catch {
          // If we can't refresh credentials, propagate the original error
          throw new Error(
            `Tool execution failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // Rethrow if not an auth error or we couldn't recover
      throw error;
    }
  }

  /**
   * Cleans up resources and closes connections
   * Should be called when the client is no longer needed
   */
  async cleanup(): Promise<void> {
    if (this.transport) {
      try {
        await this.client?.close();
        this.transport = null;
        this.client = null;
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : "Unknown error";
        console.error("Error during cleanup:", errorMessage);
      }
    }
  }

  /**
   * Force refresh of OAuth credentials
   * Useful when tokens have expired or been invalidated
   */
  async forceFetchCredentials(): Promise<void> {
    if (!this.authProvider || !this.serverUrl) {
      console.warn(
        "Cannot force fetch credentials: No auth provider or server URL",
      );
      return;
    }

    try {
      // If the provider has a method to clear auth data, use it
      if (this.hasAuthClearMethod(this.authProvider)) {
        console.log("Clearing existing authentication data...");
        await this.authProvider.clearAuthData();
      }

      console.log("Fetching fresh authentication credentials...");
      const result = await auth(this.authProvider, {
        serverUrl: this.serverUrl,
      });

      if (!result) {
        throw new Error(`Authentication failed with result: ${result}`);
      }

      this.authRetryCount = 0; // Reset retry count on success

      console.log("Successfully refreshed authentication credentials");
    } catch (error) {
      this.authRetryCount++;
      console.error(
        `Failed to fetch credentials (attempt ${this.authRetryCount}):`,
        error instanceof Error ? error.message : error,
      );

      // If we've reached the max retry count, throw a more descriptive error
      if (this.authRetryCount >= this.config.maxAuthRetries) {
        throw new Error(
          `Authentication failed after ${this.authRetryCount} attempts: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }

      // Otherwise, let the caller handle the retry
      throw error;
    }
  }

  /**
   * Checks if an error is related to authentication
   * @param error The error to check
   * @returns True if the error is authentication-related
   */
  private isAuthenticationError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("auth") ||
        message.includes("unauthorized") ||
        message.includes("unauthenticated") ||
        message.includes("token") ||
        message.includes("credentials") ||
        message.includes("401")
      );
    }
    return false;
  }

  /**
   * Checks if an OAuth provider has the clearAuthData method
   * @param provider The provider to check
   * @returns True if the provider has the clearAuthData method
   */
  private hasAuthClearMethod(
    provider: OAuthClientProvider,
  ): provider is OAuthProviderWithClear {
    return "clearAuthData" in provider &&
      typeof (provider as OAuthProviderWithClear).clearAuthData === "function";
  }

  /**
   * Builds the appropriate transport based on connection mode and configuration
   * @param mode Connection mode (CLI or SSE)
   * @param config Server configuration
   * @returns The configured transport
   */
  private buildTransport(mode: ConnectionMode, config: IMcpServerConfig) {
    switch (mode) {
      case ConnectionMode.CLI: {
        if (!("command" in config)) {
          throw new Error("CLI mode requires command and args");
        }

        // Common environment variables to pass through
        const commonEnvVars = ["PATH", "HOME", "SHELL", "TERM"];

        // Get environment variables, with default only for LANG
        const filteredEnvVars = {
          ...Object.fromEntries(
            commonEnvVars
              .map((key) => [key, Deno.env.get(key)])
              .filter(([_, value]) => value !== null),
          ),
          LANG: Deno.env.get("LANG") || "en_US.UTF-8",
        };

        return new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: {
            ...filteredEnvVars,
            ...config.env,
          } as Record<string, string>,
        });
      }

      case ConnectionMode.SSE: {
        if (!("url" in config)) {
          throw new Error("SSE mode requires a URL");
        }

        // Store the server URL for later OAuth operations
        this.serverUrl = new URL(config.url);

        // Create SSE transport with or without OAuth
        if (this.authProvider) {
          console.log(
            `Creating SSE transport with OAuth for ${this.serverUrl}`,
          );
          return new SSEClientTransport(this.serverUrl, {
            authProvider: this.authProvider,
          });
        } else {
          console.log(
            `Creating SSE transport without OAuth for ${this.serverUrl}`,
          );
          return new SSEClientTransport(this.serverUrl);
        }
      }

      default:
        throw new Error(`Unsupported connection mode: ${mode as string}`);
    }
  }
}

function jsonToZod(inputSchema: {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
}) {
  const properties = inputSchema.properties ?? {};
  const required = inputSchema.required ?? [];

  const schemaProperties = Object.entries(properties).reduce(
    (acc: Record<string, z.ZodTypeAny>, [key, value]) => {
      const property = value as { type: string; description?: string };
      const zodType = createZodType(property);
      acc[key] = required.includes(key) ? zodType : zodType.optional();
      return acc;
    },
    {} as Record<string, z.ZodTypeAny>,
  );

  return z.object(schemaProperties);
}

function createZodType(property: {
  type: string;
  description?: string;
}): z.ZodTypeAny {
  const typeMap: Record<string, () => z.ZodTypeAny> = {
    string: () => z.string(),
    number: () => z.number(),
    boolean: () => z.boolean(),
    array: () => z.array(z.any()),
    object: () => z.record(z.any()),
  };

  const zodType = typeMap[property.type]?.() ?? z.any();
  return property.description
    ? zodType.describe(property.description)
    : zodType;
}
