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
import { jsonToZod } from "./utils/zod.ts";
import { ConnectionMode } from "./utils/transport.ts";
import type { ZypherMcpServer } from "./types/local.ts";
import type { OAuthProviderOptions } from "./types/auth.ts";
import { McpOAuthClientProvider } from "./auth/McpOAuthClientProvider.ts";

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
  #status: "connected" | "disconnected" | "auth_needed" = "disconnected";
  static readonly REASON_TRANSPORT_FALLBACK = "transport-fallback";
  static readonly REASON_AUTH_NEEDED = "auth-needed";
  transport:
    | StdioClientTransport
    | SSEClientTransport
    | StreamableHTTPClientTransport
    | null = null;
  #server: ZypherMcpServer;
  #tools: Tool[] = [];

  /**
   * Creates a new MCPClient instance
   * @param config Optional configuration for the client
   */
  constructor(
    config: IMcpClientConfig,
    server: ZypherMcpServer,
  ) {
    this.#server = server;
    this.#client = new Client({
      id: config.id ?? "",
      name: config.name ?? "d8c3fc66-e479-4359-ae88-a757d4dfdf28",
      version: config.version ?? "1.0.0",
    });
  }

  /**
   * Connects to the MCP server
   * @param mode Connection mode (CLI or SSE)
   * @param config Server configuration
   */
  connect = async (
    mode: ConnectionMode = ConnectionMode.HTTP_FIRST,
    oAuthProviderOptions?: OAuthProviderOptions,
  ): Promise<void> => {
    this.#connectionAttempts.clear();
    await this.#connectRecursive(mode, oAuthProviderOptions);
  };

  #connectRecursive = async (
    mode: ConnectionMode,
    oAuthProviderOptions?: OAuthProviderOptions,
    oAuthProvider?: McpOAuthClientProvider,
  ): Promise<void> => {
    this.#ensureClient();

    // If mode is CLI, handle CLI connection and skip remote logic.
    if (mode === ConnectionMode.CLI) {
      if (!this.#server.packages || this.#server.packages.length === 0) {
        throw new Error("Connection Error: No packages defined for CLI mode.");
      }
      await this.#handleCliConnect();
      return;
    }

    // For other modes, handle remote transports (SSE/HTTP) with fallback.
    if (!this.#server.remotes || this.#server.remotes.length === 0) {
      throw new Error(
        `Connection failed: No remote servers configured for mode '${mode}'`,
      );
    }

    const remote = this.#server.remotes[0];
    const sseFailed = this.#connectionAttempts.has(SSEClientTransport.name);
    const httpFailed = this.#connectionAttempts.has(
      StreamableHTTPClientTransport.name,
    );

    const useSse = mode === ConnectionMode.SSE_ONLY ||
      (mode === ConnectionMode.SSE_FIRST && !sseFailed) ||
      (mode === ConnectionMode.HTTP_FIRST && httpFailed);

    const mcpServerUrl = new URL(remote.url);

    this.transport = useSse
      ? new SSEClientTransport(mcpServerUrl, {
        authProvider: oAuthProvider,
      })
      : new StreamableHTTPClientTransport(mcpServerUrl, {
        authProvider: oAuthProvider,
      });

    try {
      await this.#client!.connect(this.transport);
      console.log(
        `Connected to remote server using ${this.transport.constructor.name}`,
      );
    } catch (error) {
      const transportId = this.transport.constructor.name;
      if (this.#isFallbackError(mode, error)) {
        this.#connectionAttempts.add(transportId);

        const sseFailed = this.#connectionAttempts.has(SSEClientTransport.name);
        const httpFailed = this.#connectionAttempts.has(
          StreamableHTTPClientTransport.name,
        );

        // Only attempt fallback if we are in a fallback-enabled mode and haven't exhausted all options.
        if (
          (mode === ConnectionMode.SSE_FIRST && !httpFailed) ||
          (mode === ConnectionMode.HTTP_FIRST && !sseFailed)
        ) {
          return await this.#connectRecursive(
            mode,
            oAuthProviderOptions,
            oAuthProvider,
          );
        }

        throw error; // All fallback options exhausted or not a fallback mode.
      } else if (this.#isAuthError(error)) {
        if (this.#connectionAttempts.has(McpClient.REASON_AUTH_NEEDED)) {
          throw new Error("Authentication failed after retry. Giving up.");
        }
        this.#connectionAttempts.add(McpClient.REASON_AUTH_NEEDED);

        // If we have an existing OAuth provider, try to use it
        if (oAuthProvider) {
          return await this.#connectRecursive(
            mode,
            oAuthProviderOptions,
            oAuthProvider,
          );
        }
        // Ensure OAuth options are properly set
        const effectiveOAuthOptions: OAuthProviderOptions =
          oAuthProviderOptions || {
            serverUrl: this.#server.remotes?.[0]?.url || "",
            callbackPort: 8964, // Use different port to avoid conflict with API server
            clientName: "zypher-agent-api",
            host: "localhost",
          };

        // Create OAuth provider and initiate flow
        const newOAuthProvider = new McpOAuthClientProvider(
          effectiveOAuthOptions,
          // Propagate optional onRedirect handler so that higher layers can capture
          // the authorization URL and expose it to the frontend. Ensure the passed
          // handler conforms to the expected Promise<void> signature.
          effectiveOAuthOptions.onRedirect
            ? async (url: string) => {
              await effectiveOAuthOptions.onRedirect?.(url);
            }
            : undefined,
        );
        await newOAuthProvider.initialize();

        // Check if we already have tokens
        const existingTokens = await newOAuthProvider.tokens();
        if (existingTokens) {
          try {
            return await this.#connectRecursive(
              mode,
              effectiveOAuthOptions,
              newOAuthProvider,
            );
          } catch (error) {
            // If the existing tokens failed and it's still an auth error,
            // clear the tokens and start fresh OAuth flow
            if (this.#isAuthError(error)) {
              await newOAuthProvider.clearOAuthData();
              // Continue to start fresh OAuth flow below
            } else {
              throw error;
            }
          }
        }

        // No tokens available, need to start OAuth flow

        // Reset auth attempts to allow the OAuth flow to proceed
        this.#connectionAttempts.delete(McpClient.REASON_AUTH_NEEDED);

        // Attempt connection which will trigger OAuth flow
        return await this.#connectRecursive(
          mode,
          effectiveOAuthOptions,
          newOAuthProvider,
        );
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
    const isFromMcpStore = this.#server.isFromMcpStore;
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
    const runtimeArgs =
      config.runtimeArguments?.map((arg) => arg.value ?? "") ?? [];
    const allArgs = [
      ...(isFromMcpStore ? [config.name] : []),
      ...runtimeArgs,
      ...packageArgs,
    ];
    console.log("config", config);
    const command = this.#parseCommand(config.registryName);
    console.log("[command]", command, "with args:", allArgs);
    this.transport = new StdioClientTransport({
      command: command,
      args: allArgs,
      env: { ...filteredEnvVars, ...cliEnv },
    });
    await this.#client!.connect(this.transport);
    return;
  };

  #parseCommand = (command: string): string => {
    switch (command) {
      case "npm":
        return "npx";
      case "yarn":
        return "npx";
      case "pnpm":
        return "npx";
      case "bun":
        return "npx";
      case "pypi":
        return "uvx";
      case "pipx":
        return "uvx";
      case "uv":
        return "uvx";
      case "docker":
        return "docker";
      default:
        return command;
    }
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
  async retrieveTools(
    mode: ConnectionMode,
    oAuthProviderOptions?: OAuthProviderOptions,
  ): Promise<Tool[]> {
    try {
      if (!this.#client) {
        throw new Error("Client is not initialized");
      }

      // Connect to the server
      await this.connect(mode, oAuthProviderOptions);
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
        `${this.#server.name}_${tool.name}`,
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
  }

  #isFallbackError = (mode: ConnectionMode, error: unknown): boolean => {
    const shouldAttemptFallback = mode === ConnectionMode.HTTP_FIRST ||
      mode === ConnectionMode.SSE_FIRST;

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

  #isAuthError = (error: unknown): boolean => {
    const errorMessage = (error instanceof Error ? error.message : "")
      .toLowerCase();
    return errorMessage.includes("401") ||
      errorMessage.includes("403") ||
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("oauth") ||
      errorMessage.includes("oauth 2.0");
  };
}
