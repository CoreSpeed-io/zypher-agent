import { McpClient } from "./McpClient.ts";
import type { Tool } from "../tools/mod.ts";
import { z } from "zod";
import { getWorkspaceDataDir } from "../utils/mod.ts";
import { join } from "@std/path";
import { formatError } from "../error.ts";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { type ZypherMcpServer, ZypherMcpServerSchema } from "./types/local.ts";
import { ConnectionMode } from "./utils/transport.ts";
import type { OAuthProviderOptions } from "./types/auth.ts";
import { ApiError } from "../../bin/api-server/src/error.ts";

export class McpServerError extends Error {
  constructor(
    public code: "already_exists" | "server_error",
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "McpServerError";
  }
}

/**
 * Optional OAuth provider factory function type
 * Applications can provide this to create OAuth providers for remote servers
 */
export type OAuthProviderFactory = (
  serverId: string,
  serverUrl: string,
  clientName: string,
) => Promise<OAuthClientProvider | undefined>;

/**
 * McpServerManager is a class that manages MCP (Model Context Protocol) servers and their tools.
 * It handles server registration, tool management, and configuration persistence.
 *
 * Authentication is handled by the McpClient layer.
 */
export class McpServerManager {
  #config: ZypherMcpServer[] | null = null;
  // serverMap maintains all server configurations
  #serverMap = new Map<string, ZypherMcpServer>();
  // clientMap maintains all MCP clients, keyed by server ID
  #clientMap = new Map<string, McpClient>();
  // toolbox for directly registered tools (non-MCP tools)
  #toolbox: Map<string, Tool> = new Map();
  #initialized = false;
  #configFile = "mcp.json";
  #dataDir: string | null = null;
  #mcpRegistryBaseUrl: string | null = null;
  #oauthProviderFactory?: OAuthProviderFactory;
  #clientName: string;

  constructor(
    oauthProviderFactory?: OAuthProviderFactory,
    clientName?: string,
  ) {
    this.#oauthProviderFactory = oauthProviderFactory;
    this.#clientName = clientName ?? "zypher-agent-api";
  }

  #createMcpClient(
    server: ZypherMcpServer,
  ): McpClient {
    return new McpClient(
      {
        id: server._id,
        name: server.name,
      },
      server,
    );
  }

  /**
   * Initializes the McpServerManager by loading configuration and setting up servers
   * @returns The initialized McpServerManager instance
   */
  async init() {
    if (this.#initialized) {
      return this;
    }

    // Get workspace data directory
    this.#dataDir = await getWorkspaceDataDir();

    // Get MCP API base URL
    this.#mcpRegistryBaseUrl = Deno.env.get("MCP_SERVER_REGISTRY_URL") ?? null;

    // Load and parse server configs from mcp.json
    await this.#loadConfig();

    // Initialize servers and fetch their tools
    await this.#initializeServers();

    this.#initialized = true;
    return this;
  }

  /**
   * Gets the full path for a configuration file
   * @param filename The configuration file name
   * @returns The full path to the configuration file
   */
  #getConfigPath = (filename: string): string => {
    if (!this.#dataDir) {
      throw new Error("Data directory not initialized");
    }
    return join(this.#dataDir, filename);
  };

  /**
   * Loads and validates the MCP configuration from mcp.json
   * @throws Error if config file is invalid or cannot be loaded
   */
  #loadConfig = async (): Promise<void> => {
    try {
      const configPath = this.#getConfigPath(this.#configFile);
      try {
        await Deno.stat(configPath);
      } catch {
        const defaultConfig: ZypherMcpServer[] = [];
        await Deno.writeTextFile(
          configPath,
          JSON.stringify(defaultConfig, null, 2),
        );
        this.#config = defaultConfig;
        return;
      }

      this.#config = ZypherMcpServerSchema.array().parse(
        JSON.parse(await Deno.readTextFile(configPath)),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid MCP config structure: ${formatError(error)}`);
      }
      const errorMessage = error instanceof Error
        ? error.message
        : "Unknown error";
      throw new Error(
        `Failed to load MCP config: ${formatError(errorMessage)}`,
      );
    }
  };

  /**
   * Reloads the configuration from mcp.json and reinitializes all servers
   * @throws Error if reload fails
   */
  async reloadConfig(): Promise<void> {
    try {
      // Cleanup existing servers
      await this.cleanup();

      // Reset state
      this.#initialized = false;
      this.#config = null;

      // Reload configuration
      await this.init();
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Unknown error";
      throw new Error(
        `Failed to reload MCP config: ${formatError(errorMessage)}`,
      );
    }
  }

  /**
   * Initializes all configured servers and registers their tools
   * @throws Error if config is not loaded or server initialization fails
   */
  #initializeServers = async (
    oAuthProviderOptions?: OAuthProviderOptions,
  ): Promise<void> => {
    if (!this.#config) {
      throw new Error("Config not loaded. Call loadConfig() first.");
    }

    // Initialize all servers from config
    for (const serverConfig of this.#config) {
      this.#serverMap.set(serverConfig._id, serverConfig);
    }

    // Then initialize clients for all servers
    const serverInitPromises = Array.from(this.#serverMap.entries()).map(
      async ([serverId, server]) => {
        try {
          await this.#initializeServerClient(
            serverId,
            server,
            oAuthProviderOptions,
          );
        } catch (error) {
          console.error(
            `Failed to initialize server ${server.name}: ${formatError(error)}`,
          );
          // Remove the failed server
          this.#serverMap.delete(serverId);
          this.#clientMap.delete(serverId);
        }
      },
    );

    await Promise.all(serverInitPromises);
  };

  /**
   * Initializes the client for a server
   * @param serverId The server ID
   * @param server The server configuration
   */
  async #initializeServerClient(
    serverId: string,
    server: ZypherMcpServer,
    oAuthProviderOptions?: OAuthProviderOptions,
  ): Promise<void> {
    try {
      console.log(`Initializing client for server: ${server.name}`);

      // Create MCP client with server config
      const client = await this.#createMcpClient(server);
      this.#clientMap.set(serverId, client);

      // Only retrieve tools if server is enabled
      if (server.isEnabled) {
        const connectionMode = (server.remotes && server.remotes.length > 0)
          ? ConnectionMode.SSE_FIRST
          : ConnectionMode.CLI;
        console.log(
          `Connection mode: ${
            connectionMode !== ConnectionMode.CLI ? "REMOTE" : "CLI"
          }`,
        );

        console.log("Retrieving tools from server...");
        await client.retrieveTools(oAuthProviderOptions);
        console.log(
          `Successfully initialized ${client.getToolCount()} tools for server ${server.name}`,
        );

        if (client.getToolCount() > 0) {
          console.log(
            `Tool names: ${client.getTools().map((t) => t.name).join(", ")}`,
          );
        }
      } else {
        console.log(
          `Server ${server.name} is disabled, skipping tool retrieval`,
        );
      }
    } catch (error) {
      console.error(
        `Failed to initialize client for server ${server.name}:`,
        formatError(error),
      );
      throw error;
    }
  }

  /**
   * Registers a new MCP server and its tools
   * @param server Server configuration
   * @throws McpServerError if server registration fails or server already exists
   */
  async registerServer(
    server: ZypherMcpServer,
    oAuthProviderOptions?: OAuthProviderOptions,
  ): Promise<void> {
    try {
      if (!this.#config) {
        throw new Error("Config not loaded");
      }
      if (this.#getServer(server._id)) {
        throw new McpServerError(
          "already_exists",
          `Server ${server.name} already exists`,
        );
      }

      // Add server to map
      this.#serverMap.set(server._id, server);

      // Initialize server client
      await this.#initializeServerClient(
        server._id,
        server,
        oAuthProviderOptions,
      );

      this.#config.push(server);
      await this.#saveConfig();
    } catch (error) {
      // Clean up on failure
      this.#serverMap.delete(server._id);
      const client = this.#clientMap.get(server._id);
      if (client) {
        await client.cleanup();
        this.#clientMap.delete(server._id);
      }

      if (error instanceof McpServerError) {
        throw error;
      }

      console.error(
        `Failed to register server ${server.name}:`,
        formatError(error),
      );
      throw new McpServerError(
        "server_error",
        `Failed to register server ${server.name}: ${formatError(error)}`,
      );
    }
  }

  /**
   * Deregisters a server and removes its tools
   * @param id ID of the server to deregister
   * @throws Error if server is not found or deregistration fails
   */
  async deregisterServer(id: string): Promise<void> {
    const server = this.#getServer(id);
    if (!server) {
      throw new ApiError(
        404,
        "not_found",
        `Server with id ${id} not found`,
      );
    }

    try {
      // First cleanup the server client
      const client = this.#clientMap.get(id);
      if (client) {
        await client.cleanup();
        this.#clientMap.delete(id);
      }

      // Remove server from map
      this.#serverMap.delete(id);

      // Update mcp.json file
      if (this.#config) {
        this.#config = this.#config.filter((server) => server._id !== id);
        await this.#saveConfig();
      }
    } catch (error) {
      throw new Error(
        `Failed to deregister server ${id}: ${formatError(error)}`,
      );
    }
  }

  /**
   * Updates the configuration of an existing server
   * @param id ID of the server to update
   * @param config New server configuration
   * @throws Error if server is not found or update fails
   */
  async updateServerConfig(
    id: string,
    servers: ZypherMcpServer[],
    oAuthProviderOptions?: OAuthProviderOptions,
  ): Promise<void> {
    const server = this.#getServer(id);
    if (!server) {
      throw new Error(`Server with id ${id} not found`);
    }

    try {
      for (const server of servers) {
        await this.deregisterServer(server._id);
        // Register with new config but preserve the original name
        await this.registerServer(server, oAuthProviderOptions);
      }
    } catch (error) {
      throw new Error(
        `Failed to update server ${server.name}: ${formatError(error)}`,
      );
    }
  }

  /**
   * Registers a new tool directly (non-MCP tool)
   * @param tool The tool to register
   */
  registerTool(tool: Tool): void {
    if (this.#toolbox.has(tool.name)) {
      throw new Error(`Tool ${tool.name} already registered`);
    }

    // Check if any MCP server already provides a tool with this name
    for (const [serverId, server] of this.#serverMap.entries()) {
      if (server.isEnabled) {
        const client = this.#clientMap.get(serverId);
        if (client?.getTool(tool.name)) {
          throw new Error(
            `Tool ${tool.name} already exists in MCP server ${server.name}`,
          );
        }
      }
    }

    this.#toolbox.set(tool.name, tool);
  }

  /**
   * Cleans up all server connections and resets the manager state
   */
  async cleanup(): Promise<void> {
    // Cleanup all server clients
    for (const [serverId, client] of this.#clientMap.entries()) {
      try {
        await client.cleanup();
      } catch (error) {
        const server = this.#serverMap.get(serverId);
        console.error(
          `Error cleaning up server ${server?.name ?? serverId}:`,
          error,
        );
      }
    }
    this.#serverMap.clear();
    this.#clientMap.clear();
    this.#toolbox.clear();
    this.#initialized = false;
  }

  getAllServerWithTools(): ZypherMcpServer[] {
    return Array.from(this.#serverMap.values()).map(
      (server) => {
        const client = this.#clientMap.get(server._id);
        return {
          ...server,
          tools: client?.getTools().map((tool) => tool.name) ?? [],
        };
      },
    );
  }

  /**
   * Sets the status of a server and saves it to mcp.json
   * @param serverId The ID of the server
   * @param enabled The new status
   */
  async setServerStatus(serverId: string, enabled: boolean): Promise<void> {
    const server = this.#getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    const wasEnabled = server.isEnabled;
    server.isEnabled = enabled;

    // If enabling a previously disabled server, initialize its tools
    if (enabled && !wasEnabled) {
      const client = this.#clientMap.get(serverId);
      if (client && !client.isConnected()) {
        try {
          await this.#initializeServerClient(serverId, server);
        } catch (error) {
          // Revert the status on failure
          server.isEnabled = wasEnabled;
          throw new Error(
            `Failed to enable server ${serverId}: ${formatError(error)}`,
          );
        }
      }
    }

    // Update the config
    if (this.#config?.find((server) => server._id === serverId)) {
      const configServer = this.#config.find((server) =>
        server._id === serverId
      );
      if (configServer) {
        configServer.isEnabled = enabled;
      }
      await this.#saveConfig();
    }
  }

  #getServer = (id: string): ZypherMcpServer | undefined => {
    return this.#serverMap.get(id);
  };

  /**
   * Get server by name (serverName)
   * @param serverName The name of the server to find
   * @returns The server if found, undefined otherwise
   */
  #getServerByName = (serverName: string): ZypherMcpServer | undefined => {
    for (const server of this.#serverMap.values()) {
      if (server.name === serverName) {
        return server;
      }
    }
    return undefined;
  };

  /**
   * Deregisters a server by its name and removes its tools
   * @param serverName Name of the server to deregister
   * @throws Error if server is not found or deregistration fails
   */
  async deregisterServerById(serverId: string): Promise<void> {
    const server = this.#getServer(serverId);
    if (!server) {
      throw new Error(`Server with id '${serverId}' not found`);
    }

    // Use the existing deregisterServer method with the actual ID
    await this.deregisterServer(server._id);
  }

  getServerConfig(serverId: string): ZypherMcpServer {
    const server = this.#getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    // Return config without enabled property
    return server;
  }

  /**
   * Saves the current configuration to mcp.json
   */
  #saveConfig = async (): Promise<void> => {
    if (!this.#config) {
      throw new Error("Config not loaded");
    }

    // Write config to file - config already contains the current state
    await Deno.writeTextFile(
      this.#getConfigPath(this.#configFile),
      JSON.stringify(this.#config, null, 2),
    );
  };

  /**
   * Gets all registered tools from all enabled servers and directly registered tools
   * @returns Map of tool names to tool instances
   */
  getAllTools(): Map<string, Tool> {
    const allTools = new Map<string, Tool>();

    // Add directly registered tools first
    for (const [name, tool] of this.#toolbox) {
      allTools.set(name, tool);
    }

    // Add tools from enabled MCP servers
    for (const [serverId, server] of this.#serverMap.entries()) {
      if (server.isEnabled) {
        const client = this.#clientMap.get(serverId);
        if (client) {
          for (const tool of client.getTools()) {
            // MCP tools take precedence over directly registered tools with same name
            allTools.set(tool.name, tool);
          }
        }
      }
    }

    return allTools;
  }

  /**
   * Gets a specific tool by name from directly registered tools or any enabled server
   * @param name The name of the tool to retrieve
   * @returns The tool if found, undefined otherwise
   */
  getTool(name: string): Tool | undefined {
    // Check MCP servers first (they take precedence)
    for (const [serverId, server] of this.#serverMap.entries()) {
      if (server.isEnabled) {
        const client = this.#clientMap.get(serverId);
        if (client) {
          const tool = client.getTool(name);
          if (tool) {
            return tool;
          }
        }
      }
    }

    // Then check directly registered tools
    return this.#toolbox.get(name);
  }

  /**
   * Debug method to log current state of servers and tools
   */
  getClient(id: string): McpClient | undefined {
    return this.#clientMap.get(id);
  }

  debugLogState(): void {
    console.log("\n=== MCP SERVER MANAGER STATE ===");
    console.log(`Initialized: ${this.#initialized}`);
    console.log(`Number of servers: ${this.#serverMap.size}`);
    console.log(`Number of clients: ${this.#clientMap.size}`);
    console.log(`Number of directly registered tools: ${this.#toolbox.size}`);

    const allTools = this.getAllTools();
    console.log(`Total number of tools: ${allTools.size}`);

    if (this.#toolbox.size > 0) {
      console.log(
        `\nDirectly registered tools: ${
          Array.from(this.#toolbox.keys()).join(", ")
        }`,
      );
    }

    for (const server of this.#serverMap.values()) {
      const client = this.#clientMap.get(server._id);
      console.log(`\nServer: ${server.name}`);
      console.log(`  - ID: ${server._id}`);
      console.log(`  - Enabled: ${server.isEnabled}`);
      console.log(`  - Connected: ${client?.isConnected() ?? false}`);
      console.log(`  - Tools count: ${client?.getToolCount() ?? 0}`);

      if (client && client.getToolCount() > 0) {
        console.log(
          `  - Tool names: ${client.getTools().map((t) => t.name).join(", ")}`,
        );
      }
    }

    console.log(
      `\nAll available tools: ${Array.from(allTools.keys()).join(", ")}`,
    );
    console.log("=== END STATE ===\n");
  }

  /**
   * Fetches MCP server configuration from a remote endpoint and registers the server
   * @param id The ID of the server to register from the registry
   * @returns Promise resolving when the server is registered
   * @throws Error if the fetch fails or registration fails
   */
  async registerServerFromRegistry(
    id: string,
    token: string,
    oAuthProviderOptions: OAuthProviderOptions,
  ) {
    try {
      console.log(`Fetching configuration for server ${id} from registry...`);

      // Validate registry URL
      if (!this.#mcpRegistryBaseUrl) {
        throw new Error(
          "MCP registry URL not configured. Set MCP_SERVER_REGISTRY_URL environment variable.",
        );
      }

      // Fetch server config from registry
      const url = `${this.#mcpRegistryBaseUrl}/servers/${id}/config`;
      console.log(`Fetching from: ${url}`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch server config: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      console.log(`Received config for server: ${id}`);

      // Parse and validate the server configuration (handles nested structures automatically)
      const parsed = ZypherMcpServerSchema.parse(data);
      const config = parsed.packages?.[0];
      const extractedName = parsed.name;

      // Use friendly name for server registration if available, otherwise use registry ID
      const serverName = extractedName || data.name || id;
      console.log(
        `Registering server as: ${serverName}${
          extractedName ? " (friendly name extracted from config)" : ""
        }`,
      );

      // Use the friendly name for server registration (affects tool names)
      await this.registerServer({
        _id: id,
        name: serverName,
        packages: config ? [config] : undefined,
      }, oAuthProviderOptions);
      console.log(
        `Successfully registered server from registry: ${id}${
          extractedName ? ` as '${serverName}'` : ""
        }`,
      );
    } catch (error) {
      console.error(`Failed to register server ${id} from registry:`, error);
      throw new Error(
        `Failed to register server ${id} from registry: ${formatError(error)}`,
      );
    }
  }
}
