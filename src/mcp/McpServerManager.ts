import { McpClient } from "./McpClient.ts";
import type { Tool } from "../tools/mod.ts";
import { z } from "zod";
import { getWorkspaceDataDir } from "../utils/mod.ts";
import { join } from "@std/path";
import { formatError } from "../error.ts";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { type ZypherMcpServer, ZypherMcpServerSchema } from "./types/local.ts";
import { ConnectionMode, getConnectionMode } from "./utils/transport.ts";

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
  // toolbox only contains active tools for agent to call
  // serverToolsMap maintains all tools for each server
  #serverToolsMap = new Map<ZypherMcpServer, Tool[]>();
  #initialized = false;
  #configFile = "mcp.json";
  #dataDir: string | null = null;
  #mcpRegistryBaseUrl: string | null = null;
  #oauthProviderFactory?: OAuthProviderFactory;
  #clientName: string;
  #toolbox: Map<string, Tool> = new Map();

  constructor(
    oauthProviderFactory?: OAuthProviderFactory,
    clientName?: string,
  ) {
    this.#oauthProviderFactory = oauthProviderFactory;
    this.#clientName = clientName ?? "zypher-agent-api";
  }

  async #createMcpClient(
    server: ZypherMcpServer,
  ): Promise<McpClient> {
    let oauthProvider: OAuthClientProvider | undefined = undefined;
    const isRemoteServer = "url" in server.packages[0];

    if (
      isRemoteServer && server.packages[0].registryName &&
      this.#oauthProviderFactory
    ) {
      oauthProvider = await this.#oauthProviderFactory(
        server._id,
        server.packages[0].registryName,
        this.#clientName,
      );
    }

    return new McpClient({
      id: server._id,
      serverName: server.name,
      oAuthProvider: oauthProvider,
    });
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
  #initializeServers = async (): Promise<void> => {
    if (!this.#config) {
      throw new Error("Config not loaded. Call loadConfig() first.");
    }

    // Initialize all servers from config
    for (const serverConfig of this.#config) {
      this.#serverToolsMap.set(serverConfig, []);
    }

    // Then fetch and register tools for all servers
    const serverInitPromises = Array.from(this.#serverToolsMap.entries()).map(
      async ([server, _]) => {
        try {
          await this.#registerServerTools(server);
        } catch (error) {
          console.error(
            `Failed to initialize server ${server.name}: ${formatError(error)}`,
          );
          // Remove the failed server
          this.#serverToolsMap.delete(server);
        }
      },
    );

    await Promise.all(serverInitPromises);
  };

  /**
   * Registers a new MCP server and its tools
   * @param server Server configuration
   * @throws McpServerError if server registration fails or server already exists
   */
  async registerServer(
    server: ZypherMcpServer,
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

      // Create MCP client with OAuth provider if needed
      server.client = await this.#createMcpClient(server);
      this.#serverToolsMap.set(server, []);

      // Register server tools - let McpClient handle all authentication
      await this.#registerServerTools(server);

      this.#config.push(server);
      await this.#saveConfig();
    } catch (error) {
      // Clean up on failure
      this.#serverToolsMap.delete(server);
      await server.client?.cleanup();

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
      throw new Error(`Server with id ${id} not found`);
    }

    try {
      // First cleanup the server client
      await server.client?.cleanup();

      // Remove all tools from toolbox
      const tools = this.#serverToolsMap.get(server);
      if (tools) {
        for (const tool of tools) {
          this.#toolbox.delete(tool.name);
        }
      }

      // Remove server and its tools from serverToolsMap
      this.#serverToolsMap.delete(server);

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
    _server: ZypherMcpServer,
  ): Promise<void> {
    const server = this.#getServer(_server._id);
    if (!server) {
      throw new Error(`Server with id ${_server._id} not found`);
    }

    try {
      // Deregister existing server
      await this.deregisterServer(_server._id);
      // Register with new config but preserve the original name
      await this.registerServer(_server);
    } catch (error) {
      throw new Error(
        `Failed to update server ${_server.name}: ${formatError(error)}`,
      );
    }
  }

  /**
   * Registers a new tool
   * @param tool The tool to register
   */
  registerTool(tool: Tool): void {
    if (this.#toolbox.has(tool.name)) {
      throw new Error(`Tool ${tool.name} already registered`);
    }
    this.#toolbox.set(tool.name, tool);
  }

  /**
   * Cleans up all server connections and resets the manager state
   */
  async cleanup(): Promise<void> {
    // Cleanup all server clients
    for (const server of this.#serverToolsMap.keys()) {
      try {
        await server.client?.cleanup();
      } catch (error) {
        console.error(`Error cleaning up server ${server.name}:`, error);
      }
    }
    this.#serverToolsMap.clear();
    this.#toolbox.clear();
    this.#initialized = false;
  }

  getAllServerWithTools(): ZypherMcpServer[] {
    return Array.from(this.#serverToolsMap.entries()).map(
      ([server, tools]) => ({
        ...server,
        tools: tools.map((tool) => tool.name),
      }),
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

    server.isEnabled = enabled;
    const tools = this.#serverToolsMap.get(server);
    if (enabled && tools) {
      // Re-add tools to toolbox when enabling
      for (const tool of tools) {
        this.#toolbox.set(tool.name, tool);
      }
    } else if (!enabled) {
      // Remove tools from toolbox when disabling
      this.#removeServerTools(serverId);
    }

    // Update the config
    if (this.#config?.find((server) => server._id === serverId)) {
      const server = this.#config.find((server) => server._id === serverId);
      if (server) {
        server.isEnabled = enabled;
      }
      await this.#saveConfig();
    }
  }

  #getServer = (id: string): ZypherMcpServer | undefined => {
    for (const server of this.#serverToolsMap.keys()) {
      if (server._id === id) {
        return server;
      }
    }
    return undefined;
  };

  /**
   * Get server by name (serverName)
   * @param serverName The name of the server to find
   * @returns The server if found, undefined otherwise
   */
  #getServerByName = (serverName: string): ZypherMcpServer | undefined => {
    for (const server of this.#serverToolsMap.keys()) {
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

    // Update server configurations with current server state
    for (const server of this.#serverToolsMap.keys()) {
      this.#config.push(server);
    }

    // Write config to file
    await Deno.writeTextFile(
      this.#getConfigPath(this.#configFile),
      JSON.stringify(this.#config, null, 2),
    );
  };

  /**
   * Removes all tools associated with a server from the toolbox
   * @param serverId The ID of the server
   */
  #removeServerTools = (serverId: string): void => {
    const server = this.#getServer(serverId);
    if (!server) return;
    const tools = this.#serverToolsMap.get(server);
    if (tools) {
      // Only remove from toolbox, keep in serverToolsMap
      for (const tool of tools) {
        this.#toolbox.delete(tool.name);
      }
    }
  };

  /**
   * Registers all tools for a server
   * @param server The server to register tools for
   */
  #registerServerTools = async (server: ZypherMcpServer): Promise<void> => {
    try {
      console.log(`Registering tools for server: ${server.name}`);
      const connectionMode = getConnectionMode(server.packages[0]);
      console.log(
        `Connection mode: ${
          connectionMode === ConnectionMode.REMOTE ? "REMOTE" : "CLI"
        }`,
      );

      console.log("Retrieving tools from server...");
      const tools = await server.client?.retrieveTools(connectionMode) ?? [];
      console.log(`Retrieved ${tools.length} tools for server ${server.name}`);
      if (tools.length > 0) {
        console.log(`Tool names: ${tools.map((t) => t.name).join(", ")}`);
      }

      // Store tools in serverToolsMap regardless of enabled state
      this.#serverToolsMap.set(server, tools);

      // Only add to toolbox if server is enabled
      if (server.isEnabled) {
        console.log(
          `Server ${server.name} is enabled, adding ${tools.length} tools to toolbox`,
        );
        for (const tool of tools) {
          this.#toolbox.set(tool.name, tool);
          console.log(`Added tool to toolbox: ${tool.name}`);
        }
      } else {
        console.log(
          `Server ${server.name} is disabled, not adding tools to toolbox`,
        );
      }

      console.log(
        `Successfully registered ${tools.length} tools for server ${server.name}`,
      );
    } catch (error) {
      console.error(
        `Failed to register tools for server ${server.name}:`,
        formatError(error),
      );

      // For non-OAuth errors, wrap them with additional context
      throw new Error(
        `Failed to register tools for server ${server.name}: ${
          formatError(error)
        }`,
      );
    }
  };

  /**
   * Gets all registered tools from all servers
   * @returns Map of tool names to tool instances
   */
  getAllTools(): Map<string, Tool> {
    return this.#toolbox;
  }

  /**
   * Gets a specific tool by name
   * @param name The name of the tool to retrieve
   * @returns The tool if found, undefined otherwise
   */
  getTool(name: string): Tool | undefined {
    return this.#toolbox.get(name);
  }

  /**
   * Debug method to log current state of servers and tools
   */
  debugLogState(): void {
    console.log("\n=== MCP SERVER MANAGER STATE ===");
    console.log(`Initialized: ${this.#initialized}`);
    console.log(`Number of servers: ${this.#serverToolsMap.size}`);
    console.log(`Number of tools in toolbox: ${this.#toolbox.size}`);

    for (const [server, tools] of this.#serverToolsMap.entries()) {
      console.log(`\nServer: ${server.name}`);
      console.log(`  - Name: ${server.name}`);
      console.log(`  - Enabled: ${server.isEnabled}`);
      console.log(`  - Tools count: ${tools.length}`);
      if (tools.length > 0) {
        console.log(`  - Tool names: ${tools.map((t) => t.name).join(", ")}`);
      }
    }

    console.log(
      `\nToolbox contents: ${Array.from(this.#toolbox.keys()).join(", ")}`,
    );
    console.log("=== END STATE ===\n");
  }

  /**
   * Fetches MCP server configuration from a remote endpoint and registers the server
   * @param id The ID of the server to register from the registry
   * @returns Promise resolving when the server is registered
   * @throws Error if the fetch fails or registration fails
   */
  async registerServerFromRegistry(id: string, token: string) {
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
      const config = parsed.packages[0];
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
        packages: [config],
      });
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
