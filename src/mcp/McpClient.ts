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
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/StreamableHTTP.js";
import { createTool, type Tool } from "../tools/mod.ts";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { jsonToZod } from "./utils/zod.ts";
import { ConnectionMode } from "./utils/transport.ts";
import type { ZypherMcpServer } from "./types/local.ts";

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
  id?: string;
  /** Optional client name for identification */
  name?: string;
  /** Optional version string */
  version?: string;
}

/**
 * MCPClient handles communication with MCP servers and tool execution
 */
export class McpClient {
  #client: Client | null = null;
  #connectionAttempts = new Set<string>();
  static readonly REASON_TRANSPORT_FALLBACK = "transport-fallback";
  static readonly REASON_AUTH_NEEDED = "auth-needed";
  transport:
    | StdioClientTransport
    | SSEClientTransport
    | StreamableHTTPClientTransport
    | null = null;
  #config: IMcpClientConfig;
  #mode: ConnectionMode = ConnectionMode.HTTP_FIRST;
  #server: ZypherMcpServer;
  #tools: Tool[] = [];
  authProvider?: OAuthClientProvider;
  static #oauthInProgress = new Map<string, Promise<void>>();

  /**
   * Creates a new MCPClient instance
   * @param config Optional configuration for the client
   */
  constructor(
    config: IMcpClientConfig,
    server: ZypherMcpServer,
    mode: ConnectionMode,
  ) {
    this.#config = config;
    this.#server = server;
    this.#mode = mode;
    this.#client = new Client({
      name: config.name ?? "mcp-client",
      version: config.version ?? "1.0.0",
    });
  }

  /**
   * Connects to the MCP server
   * @param mode Connection mode (CLI or SSE)
   * @param config Server configuration
   */
  connect = async (): Promise<void> => {
    this.#connectionAttempts.clear();
    await this.#connectRecursive();
  };

  #connectRecursive = async (): Promise<void> => {
    this.#ensureClient();

    // If mode is CLI, handle CLI connection and skip remote logic.
    if (this.#mode === ConnectionMode.CLI) {
      if (!this.#server.packages || this.#server.packages.length === 0) {
        throw new Error("Connection Error: No packages defined for CLI mode.");
      }
      await this.#handleCliConnect();
      return;
    }

    // For other modes, handle remote transports (SSE/HTTP) with fallback.
    if (!this.#server.remotes || this.#server.remotes.length === 0) {
      throw new Error(
        `Connection failed: No remote servers configured for mode '${this.#mode}'`,
      );
    }

    const remote = this.#server.remotes[0];
    const sseFailed = this.#connectionAttempts.has(SSEClientTransport.name);
    const httpFailed = this.#connectionAttempts.has(
      StreamableHTTPClientTransport.name,
    );

    const useSse = this.#mode === ConnectionMode.SSE_ONLY ||
      (this.#mode === ConnectionMode.SSE_FIRST && !sseFailed) ||
      (this.#mode === ConnectionMode.HTTP_FIRST && httpFailed);

    const url = new URL(remote.url);
    const authOptions = { authProvider: this.authProvider };

    this.transport = useSse
      ? new SSEClientTransport(url, authOptions)
      : new StreamableHTTPClientTransport(url, authOptions);

    try {
      await this.#client!.connect(this.transport);
      console.log(
        `Connected to remote server using ${this.transport.constructor.name}`,
      );
    } catch (error) {
      const transportId = this.transport.constructor.name;

      if (this.#isFallbackError(error)) {
        this.#connectionAttempts.add(transportId);

        const sseFailed = this.#connectionAttempts.has(SSEClientTransport.name);
        const httpFailed = this.#connectionAttempts.has(
          StreamableHTTPClientTransport.name,
        );

        // Only attempt fallback if we are in a fallback-enabled mode and haven't exhausted all options.
        if (
          (this.#mode === ConnectionMode.SSE_FIRST && !httpFailed) ||
          (this.#mode === ConnectionMode.HTTP_FIRST && !sseFailed)
        ) {
          console.log(
            `Transport failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }. Attempting fallback.`,
          );
          return await this.#connectRecursive();
        }

        throw error; // All fallback options exhausted or not a fallback mode.
      }

      if (error instanceof UnauthorizedError) {
        if (
          !this.authProvider || !this.#hasAuthClearMethod(this.authProvider)
        ) {
          throw new Error(
            "Authentication failed: No OAuth provider with clearAuthData method is configured.",
          );
        }
        if (this.#connectionAttempts.has(McpClient.REASON_AUTH_NEEDED)) {
          throw new Error("Authentication failed after retry. Giving up.");
        }
        this.#connectionAttempts.add(McpClient.REASON_AUTH_NEEDED);
        console.log(
          "Authentication required. Refreshing tokens and retrying...",
        );
        await this.authProvider.clearAuthData();
        return await this.#connectRecursive();
      }

      throw error;
    }
  };

  #handleCliConnect = async (): Promise<void> => {
    this.#ensureClient();
    const config = this.#server.packages?.[0];
    if (!config) {
      throw new Error(
        "Connection Error: First package configuration is missing for CLI mode.",
      );
    }
    const commonEnvVars = ["PATH", "HOME", "SHELL", "TERM"];
    const filteredEnvVars = {
      ...Object.fromEntries(
        commonEnvVars
          .map((key) => [key, Deno.env.get(key)])
          .filter(([_, value]) => value !== null),
      ),
      LANG: Deno.env.get("LANG") || "en_US.UTF-8",
    };
    const cliEnv = Object.fromEntries(
      config.environmentVariables?.map((
        env,
      ) => [env.name, env.value ?? ""]) ?? [],
    );
    const packageArgs =
      config.packageArguments?.map((arg) => arg.value ?? "") ?? [];
    const allArgs = config.name ? [config.name, ...packageArgs] : packageArgs;
    this.transport = new StdioClientTransport({
      command: this.#server.name,
      args: allArgs,
      env: { ...filteredEnvVars, ...cliEnv },
    });
    await this.#client!.connect(this.transport);
    return;
  };

  #ensureClient = (): void => {
    if (!this.#client) {
      throw new Error("Client is not initialized");
    }
  };

  /**
   * Connects to an MCP server and discovers available tools
   * @param config Configuration for the server connection
   * @param mode Connection mode (CLI or SSE)
   * @returns Promise resolving to the list of available tools
   * @throws Error if connection fails or server is not responsive
   */
  async retrieveTools(): Promise<Tool[]> {
    try {
      if (!this.#client) {
        throw new Error("Client is not initialized");
      }

      // Connect to the server
      this.connect();
      console.log("Connected to MCP server", this.#server.name);

      // Once connected, discover tools
      console.log("Connected to MCP server, discovering tools...");
      await this.#discoverTools();

      return this.#tools;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Unknown error";
      throw new Error(`Failed to connect to MCP server: ${errorMessage}`);
    }
  }

  /**
   * Discovers and registers tools from the MCP server
   * @private
   */
  async #discoverTools(): Promise<void> {
    if (!this.#client) {
      throw new Error("Client is not initialized");
    }

    const toolResult = await this.#client.listTools();
    console.log(`Discovered ${toolResult.tools.length} tools from server`);

    // Convert MCP tools to our internal tool format
    this.#tools = toolResult.tools.map((tool) => {
      const inputSchema = jsonToZod(tool.inputSchema);
      return createTool(
        `mcp_${this.#server.name}_${tool.name}`,
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
  }

  /**
   * Gets all tools managed by this client
   * @returns Array of tools
   */
  getTools(): Tool[] {
    return [...this.#tools];
  }

  /**
   * Gets a specific tool by name
   * @param name The name of the tool to retrieve
   * @returns The tool if found, undefined otherwise
   */
  getTool(name: string): Tool | undefined {
    return this.#tools.find((tool) => tool.name === name);
  }

  /**
   * Gets the number of tools managed by this client
   * @returns Number of tools
   */
  getToolCount(): number {
    return this.#tools.length;
  }

  /**
   * Checks if this client is connected to a server
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.#client !== null && this.transport !== null;
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
    if (!this.#client) {
      throw new Error("Client not connected");
    }

    const result = await this.#client.callTool({
      name: toolCall.name,
      arguments: toolCall.input,
    });
    return result;
  }

  /**
   * Cleans up resources and closes connections
   * Should be called when the client is no longer needed
   */
  async cleanup(): Promise<void> {
    if (this.transport) {
      try {
        await this.#client?.close();
        this.transport = null;
        this.#client = null;
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : "Unknown error";
        console.error("Error during cleanup:", errorMessage);
      }
    }

    // Clean up OAuth provider if it has callback server running
    if (this.authProvider && this.#hasAuthClearMethod(this.authProvider)) {
      try {
        // Stop any running callback server
        if (
          "stopCallbackServer" in this.authProvider &&
          typeof this.authProvider.stopCallbackServer === "function"
        ) {
          await (this.authProvider as OAuthProviderWithClear)
            .stopCallbackServer();
        }
      } catch (error) {
        console.error("Error cleaning up OAuth provider:", error);
      }
    }
  }

  #isFallbackError = (error: unknown): boolean => {
    const shouldAttemptFallback = this.#mode === ConnectionMode.HTTP_FIRST ||
      this.#mode === ConnectionMode.SSE_FIRST;

    if (!shouldAttemptFallback || !(error instanceof Error)) {
      return false;
    }

    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes("405") ||
      errorMessage.includes("method not allowed") ||
      errorMessage.includes("404") ||
      errorMessage.includes("not found")
    );
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
}
