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
  async retriveTools(
    config: IMcpServerConfig,
    mode: ConnectionMode = ConnectionMode.CLI,
  ): Promise<Tool[]> {
    try {
      if (!this.client) {
        throw new Error("Client is not initialized");
      }

      this.transport = this.buildTransport(mode, config);

      try {
        await this.client.connect(this.transport);
      } catch (error) {
        // If connection fails due to authentication, attempt to authenticate
        if (
          this.isAuthenticationError(error) && this.authProvider &&
          this.serverUrl
        ) {
          console.log("Authentication required, attempting to authenticate...");
          await this.forceFetchCredentials();
          // Retry with fresh credentials
          this.transport = this.buildTransport(mode, config);
          await this.client.connect(this.transport);
        } else {
          throw error;
        }
      }

      // Reset auth retry counter on successful connection
      this.authRetryCount = 0;

      const toolResult = await this.client.listTools();

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
   * Executes a tool call and returns the result
   * @param toolCall The tool call to execute
   * @returns The result of the tool execution
   * @throws Error if client is not connected
   */
  private async executeToolCall(toolCall: {
    name: string;
    input: Record<string, unknown>;
  }) {
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
        this.isAuthenticationError(error) && this.authProvider &&
        this.serverUrl &&
        this.config.retryAuthentication &&
        this.authRetryCount < this.config.maxAuthRetries
      ) {
        this.authRetryCount++;
        console.log(
          `Authentication failed. Retry attempt ${this.authRetryCount}/${this.config.maxAuthRetries}`,
        );

        await this.forceFetchCredentials();

        // Reconnect with fresh credentials
        if (this.transport instanceof SSEClientTransport) {
          // Create a new transport with fresh credentials
          this.transport = this.buildTransport(ConnectionMode.SSE, {
            url: this.serverUrl.toString(),
            enabled: true,
          });
          await this.client.connect(this.transport);

          // Retry the tool call
          const result = await this.client.callTool({
            name: toolCall.name,
            arguments: toolCall.input,
          });

          // Reset retry counter on success
          this.authRetryCount = 0;

          return result;
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
      throw new Error("OAuth provider or server URL not initialized");
    }

    try {
      // Clear existing tokens to force new token acquisition
      if (this.hasAuthClearMethod(this.authProvider)) {
        await this.authProvider.clearAuthData();
      }

      // Trigger the auth flow to get new credentials
      const result = await auth(this.authProvider, {
        serverUrl: this.serverUrl,
        // For client credentials flow, we don't need an authorization code
      });

      if (result !== "AUTHORIZED") {
        throw new Error("Failed to fetch credentials");
      }

      console.log("Successfully refreshed OAuth credentials");
    } catch (error) {
      console.error(
        "Failed to refresh credentials:",
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Handles OAuth authentication for server-to-server contexts
   * Note: For server environments, we use client credentials flow
   */
  async handleServerAuth(): Promise<boolean> {
    if (!this.authProvider || !this.serverUrl) {
      throw new Error("OAuth provider or server URL not initialized");
    }

    try {
      const result = await auth(this.authProvider, {
        serverUrl: this.serverUrl,
      });

      return result === "AUTHORIZED";
    } catch (error) {
      console.error(
        "OAuth authentication error:",
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }

  /**
   * Checks if the client is authenticated with the server
   * @returns True if authenticated, false otherwise
   */
  async isAuthenticated(): Promise<boolean> {
    if (!this.authProvider) {
      return false;
    }

    try {
      const tokens = await this.authProvider.tokens();
      return !!tokens && !!tokens.access_token;
    } catch (error) {
      console.error(
        "Error checking authentication status:",
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }

  /**
   * Clears all authentication data
   */
  async clearAuthData(): Promise<void> {
    if (this.authProvider && this.hasAuthClearMethod(this.authProvider)) {
      await this.authProvider.clearAuthData();
    }
  }

  /**
   * Type guard to check if the provider has clearAuthData method
   */
  private hasAuthClearMethod(
    provider: OAuthClientProvider,
  ): provider is OAuthProviderWithClear {
    return "clearAuthData" in provider &&
      typeof (provider as OAuthProviderWithClear).clearAuthData === "function";
  }

  /**
   * Checks if an error is related to authentication
   */
  private isAuthenticationError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("unauthorized") ||
        message.includes("authentication") ||
        message.includes("auth") ||
        message.includes("401")
      );
    }
    return false;
  }

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
          return new SSEClientTransport(this.serverUrl, {
            authProvider: this.authProvider,
          });
        } else {
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
