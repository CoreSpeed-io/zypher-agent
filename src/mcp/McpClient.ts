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
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { z } from "zod";
import type { IMcpServerConfig } from "./types.ts";

/**
 * Interface for an OAuth provider with clearAuthData and stopCallbackServer methods
 */
interface OAuthProviderWithClear extends OAuthClientProvider {
  clearAuthData(): Promise<void>;
  stopCallbackServer(): Promise<void>;
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
  oAuthProvider?: OAuthClientProvider;
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
  #client: Client | null = null;
  #transport: StdioClientTransport | SSEClientTransport | null = null;
  #config: IMcpClientConfig & {
    name: string;
    version: string;
    serverName: string;
    retryAuthentication: boolean;
    maxAuthRetries: number;
  };
  #authProvider?: OAuthClientProvider;
  #serverUrl?: URL;
  #authRetryCount = 0;

  static #oauthInProgress = new Map<string, Promise<void>>();

  /**
   * Creates a new MCPClient instance
   * @param config Optional configuration for the client
   */
  constructor(config: IMcpClientConfig = {}) {
    this.#config = {
      name: config.name ?? "mcp-client",
      version: config.version ?? "1.0.0",
      serverName: config.serverName ?? "default-server",
      retryAuthentication: config.retryAuthentication ?? true,
      maxAuthRetries: config.maxAuthRetries ?? 3,
      ...config,
    };

    this.#authProvider = config.oAuthProvider;

    this.#client = new Client(
      {
        name: this.#config.name,
        version: this.#config.version,
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
      if (!this.#client) {
        throw new Error("Client is not initialized");
      }

      this.#authRetryCount = 0; // Reset auth retry count for new connection attempt

      // Try to connect with authentication retries if needed
      await this.#connectWithRetry(mode, config);

      // Once connected, discover tools
      console.log("Connected to MCP server, discovering tools...");
      const toolResult = await this.#client.listTools();
      console.log(`Discovered ${toolResult.tools.length} tools from server`);

      // Convert MCP tools to our internal tool format
      const tools = toolResult.tools.map((tool) => {
        const inputSchema = jsonToZod(tool.inputSchema);
        return createTool(
          `mcp_${this.#config.serverName}_${tool.name}`,
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
   * Attempts to connect to the MCP server with enhanced error handling and authentication verification
   * @param mode Connection mode (CLI or SSE)
   * @param config Server configuration
   */
  #connectWithRetry = async (
    mode: ConnectionMode,
    serverConfig: IMcpServerConfig,
  ): Promise<void> => {
    if (!this.#client) {
      throw new Error("Client not initialized");
    }

    const maxRetries = this.#config.retryAuthentication
      ? this.#config.maxAuthRetries
      : 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.#transport = this.#buildTransport(mode, serverConfig); // Build transport for each attempt
        console.log(
          `[${this.#config.serverName}] Connection attempt ${attempt}/${maxRetries} to MCP server...`,
        );

        if (mode === ConnectionMode.SSE && this.#authProvider) {
          console.log(
            `[${this.#config.serverName}] Checking OAuth token status before connection...`,
          );
          let tokens = await this.#authProvider.tokens();

          if (!tokens || !tokens.access_token) {
            if (!this.#serverUrl) {
              throw new Error(
                "serverUrl is not set in McpClient, cannot proceed with OAuth.",
              );
            }
            const serverUrlString = this.#serverUrl.href;
            console.log(
              `[${this.#config.serverName}] No valid tokens for ${serverUrlString}. Attempting to fetch/await credentials.`,
            );

            let fetchPromise = McpClient.#oauthInProgress.get(serverUrlString);

            if (fetchPromise) {
              console.log(
                `[${this.#config.serverName}] Authentication for ${serverUrlString} already in progress, awaiting...`,
              );
              try {
                await fetchPromise;
                console.log(
                  `[${this.#config.serverName}] Finished awaiting in-progress authentication for ${serverUrlString}.`,
                );
              } catch (e) {
                console.error(
                  `[${this.#config.serverName}] Error awaiting in-progress authentication for ${serverUrlString}:`,
                  e,
                );
                // Fall through to try fetching fresh tokens, or let the outer loop handle failure
              }
            } else {
              console.log(
                `[${this.#config.serverName}] Initiating new authentication for ${serverUrlString}.`,
              );
              fetchPromise = this.forceFetchCredentials().catch((err) => {
                // Catch error from forceFetchCredentials to ensure finally block runs and to prevent unhandled rejections
                console.error(
                  `[${this.#config.serverName}] Error during forceFetchCredentials for ${serverUrlString}:`,
                  err,
                );
                throw err; // Re-throw to be caught by the outer try-catch of the connectWithRetry loop
              }).finally(() => {
                McpClient.#oauthInProgress.delete(serverUrlString);
                console.log(
                  `[${this.#config.serverName}] Authentication lock released for ${serverUrlString}.`,
                );
              });
              McpClient.#oauthInProgress.set(serverUrlString, fetchPromise);
              try {
                await fetchPromise;
                console.log(
                  `[${this.#config.serverName}] Newly initiated authentication finished for ${serverUrlString}.`,
                );
              } catch (e) {
                // Error already logged by forceFetchCredentials's catch, or by the lock's await catch.
                // Let the outer loop handle this as a failed attempt.
                console.error(
                  `[${this.#config.serverName}] Awaiting self-initiated auth promise failed for ${serverUrlString}:`,
                  e,
                );
              }
            }

            tokens = await this.#authProvider.tokens(); // Re-check tokens after awaiting/performing auth
            if (!tokens || !tokens.access_token) {
              throw new Error(
                `[${this.#config.serverName}] Still no valid tokens after authentication attempt for ${serverUrlString}.`,
              );
            }
            console.log(
              `[${this.#config.serverName}] Valid tokens acquired for ${serverUrlString}, proceeding with connection.`,
            );
          } else {
            console.log(
              `[${this.#config.serverName}] Valid tokens found locally, proceeding with connection...`,
            );
          }
        }

        await this.#client.connect(this.#transport);
        console.log(
          `[${this.#config.serverName}] Successfully connected to MCP server`,
        );

        // Verify connection by attempting to list tools as a basic connectivity test
        console.log("Verifying connection with basic tools list request...");
        const toolsResult = await this.#client.listTools();
        console.log(
          `Connection verified: found ${toolsResult.tools.length} tools`,
        );

        return; // Success!
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(
          `Connection attempt ${attempt} failed:`,
          lastError.message,
        );

        // Check if this is an authentication error
        if (
          this.#isAuthenticationError(lastError) &&
          this.#config.retryAuthentication && attempt < maxRetries
        ) {
          console.log(
            "Authentication error detected, attempting to refresh credentials...",
          );
          this.#authRetryCount++;

          // Clear existing auth data and retry
          if (
            this.#authProvider && this.#hasAuthClearMethod(this.#authProvider)
          ) {
            try {
              await this.#authProvider.clearAuthData();
              console.log("Cleared existing authentication data");
            } catch (clearError) {
              console.warn("Failed to clear auth data:", clearError);
            }
          }

          // Force re-authentication
          if (this.#authProvider) {
            try {
              await this.forceFetchCredentials();
              console.log(
                "Successfully refreshed credentials, retrying connection...",
              );
            } catch (authError) {
              console.error("Failed to refresh credentials:", authError);
              // Continue to retry anyway in case the issue is transient
            }
          }

          // Brief delay before retry
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        } else {
          // Not an auth error or no retries left
          break;
        }
      }
    }

    // If we get here, all retries failed
    const finalError = lastError ||
      new Error("Connection failed for unknown reason");
    throw new Error(
      `Failed to connect to MCP server after ${maxRetries} attempts: ${finalError.message}`,
    );
  };

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
    if (!this.#client) {
      throw new Error("Client not connected");
    }

    try {
      // Execute the tool call
      const result = await this.#client.callTool({
        name: toolCall.name,
        arguments: toolCall.input,
      });
      return result;
    } catch (error) {
      // Check if this is an authentication error and attempt retry if configured
      if (
        this.#isAuthenticationError(error) &&
        this.#config.retryAuthentication &&
        this.#authRetryCount < this.#config.maxAuthRetries
      ) {
        console.log(
          "Authentication error during tool execution, attempting to refresh credentials...",
        );
        this.#authRetryCount++;

        // Try to refresh credentials
        if (this.#authProvider) {
          try {
            await this.forceFetchCredentials();
            console.log("Credentials refreshed, retrying tool call...");

            // Retry the tool call
            const result = await this.#client.callTool({
              name: toolCall.name,
              arguments: toolCall.input,
            });
            this.#authRetryCount = 0; // Reset on success
            return result;
          } catch (retryError) {
            console.error(
              "Failed to execute tool after credential refresh:",
              retryError,
            );
            throw retryError;
          }
        }
      }

      // Re-throw the original error if not an auth error or retry failed
      throw error;
    }
  }

  /**
   * Cleans up resources and closes connections
   * Should be called when the client is no longer needed
   */
  async cleanup(): Promise<void> {
    if (this.#transport) {
      try {
        await this.#client?.close();
        this.#transport = null;
        this.#client = null;
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : "Unknown error";
        console.error("Error during cleanup:", errorMessage);
      }
    }

    // Clean up OAuth provider if it has callback server running
    if (this.#authProvider && this.#hasAuthClearMethod(this.#authProvider)) {
      try {
        // Stop any running callback server
        if (
          "stopCallbackServer" in this.#authProvider &&
          typeof this.#authProvider.stopCallbackServer === "function"
        ) {
          await (this.#authProvider as OAuthProviderWithClear)
            .stopCallbackServer();
        }
      } catch (error) {
        console.error("Error cleaning up OAuth provider:", error);
      }
    }
  }

  /**
   * Force refresh of OAuth credentials
   * Useful when tokens have expired or been invalidated
   * NOTE: With simplified OAuth provider, this is mainly for debugging
   */
  async forceFetchCredentials(): Promise<void> {
    console.log(
      `forceFetchCredentials called - authProvider: ${!!this
        .#authProvider}, serverUrl: ${!!this.#serverUrl}`,
    );
    if (!this.#authProvider || !this.#serverUrl) {
      console.warn(
        `Cannot force fetch credentials: No auth provider (${!!this
          .#authProvider}) or server URL (${!!this.#serverUrl})`,
      );
      return;
    }

    try {
      console.log("Attempting to fetch authentication credentials...");
      const result = await auth(this.#authProvider, {
        serverUrl: this.#serverUrl,
      });

      if (!result) {
        throw new Error(`Authentication failed with result: ${result}`);
      }

      this.#authRetryCount = 0; // Reset retry count on success
      console.log("Successfully refreshed authentication credentials");
    } catch (error) {
      console.error(
        "Failed to fetch credentials:",
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Checks if an error is related to authentication
   * @param error The error to check
   * @returns True if the error is authentication-related
   */
  #isAuthenticationError = (error: unknown): boolean => {
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
  };

  /**
   * Checks if an OAuth provider has the clearAuthData method
   * @param provider The provider to check
   * @returns True if the provider has the clearAuthData method
   */
  #hasAuthClearMethod = (
    provider: OAuthClientProvider,
  ): provider is OAuthProviderWithClear => {
    return "clearAuthData" in provider &&
      typeof (provider as OAuthProviderWithClear).clearAuthData === "function";
  };

  /**
   * Builds the appropriate transport based on connection mode and configuration
   * @param mode Connection mode (CLI or SSE)
   * @param config Server configuration
   * @returns The configured transport
   */
  #buildTransport = (mode: ConnectionMode, config: IMcpServerConfig) => {
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
        this.#serverUrl = new URL(config.url);

        // Create SSE transport with or without OAuth
        if (this.#authProvider) {
          console.log(
            `Creating SSE transport with OAuth for ${this.#serverUrl}`,
          );
          return new SSEClientTransport(this.#serverUrl, {
            authProvider: this.#authProvider,
          });
        }
        console.log(
          `Creating SSE transport without OAuth for ${this.#serverUrl}`,
        );
        return new SSEClientTransport(this.#serverUrl);
      }

      default:
        throw new Error(`Unsupported connection mode: ${mode as string}`);
    }
  };
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
