import { ConnectionMode, McpClient } from "./McpClient.ts";
import type { Tool } from "../tools/mod.ts";
import { z } from "zod";
import {
  type IMcpServer,
  type IMcpServerApi,
  type IMcpServerConfig,
  McpServerConfigSchema,
  McpServerSchema,
} from "./types.ts";
import { getWorkspaceDataDir } from "../utils/mod.ts";
import { join } from "@std/path";
import { formatError } from "../error.ts";

export class McpServerError extends Error {
  constructor(
    public code: "already_exists",
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "McpServerError";
  }
}

const McpConfigSchema = z.object({
  mcpServers: z.record(McpServerConfigSchema),
});

type IMcpConfig = z.infer<typeof McpConfigSchema>;

/**
 * McpServerManager is a class that manages MCP (Model Context Protocol) servers and their tools.
 * It handles server registration, tool management, and configuration persistence.
 */
export class McpServerManager {
  private _config: IMcpConfig | null = null;
  // toolbox only contains active tools for agent to call
  private _toolbox = new Map<string, Tool>();
  // serverToolsMap maintains all tools for each server
  private _serverToolsMap = new Map<IMcpServer, Tool[]>();
  private _initialized = false;
  private _configFile = "mcp.json";
  private _dataDir: string | null = null;
  private _mcpRegistryBaseUrl: string = Deno.env.get("MCP_API_BASE_URL") ?? "";

  /**
   * Initializes the McpServerManager by loading configuration and setting up servers
   * @returns The initialized McpServerManager instance
   */
  async init() {
    if (this._initialized) {
      return this;
    }

    // Get workspace data directory
    this._dataDir = await getWorkspaceDataDir();

    // Get MCP API base URL
    this._mcpRegistryBaseUrl = Deno.env.get("MCP_API_BASE_URL") ?? "";

    // Load and parse server configs from mcp.json
    await this.loadConfig();

    // Initialize servers and fetch their tools
    await this.initializeServers();

    this._initialized = true;
    return this;
  }

  /**
   * Gets the full path for a configuration file
   * @param filename The configuration file name
   * @returns The full path to the configuration file
   */
  private getConfigPath(filename: string): string {
    if (!this._dataDir) {
      throw new Error("Data directory not initialized");
    }
    return join(this._dataDir, filename);
  }

  /**
   * Loads and validates the MCP configuration from mcp.json
   * @throws Error if config file is invalid or cannot be loaded
   */
  private async loadConfig(): Promise<void> {
    try {
      const configPath = this.getConfigPath(this._configFile);
      try {
        await Deno.stat(configPath);
      } catch {
        const defaultConfig: IMcpConfig = {
          mcpServers: {},
        };
        await Deno.writeTextFile(
          configPath,
          JSON.stringify(defaultConfig, null, 2),
        );
        this._config = defaultConfig;
        return;
      }

      const configContent = await Deno.readTextFile(configPath);
      const parsedConfig = JSON.parse(configContent) as Record<string, unknown>;
      this._config = McpConfigSchema.parse(parsedConfig);

      // Create server instances with their enabled states from config
      for (
        const [serverId, serverConfig] of Object.entries(
          this._config.mcpServers,
        )
      ) {
        const server = McpServerSchema.parse({
          id: serverId,
          name: serverId,
          client: new McpClient({ serverName: serverId }),
          config: serverConfig,
          enabled: serverConfig.enabled ?? true,
        });
        this._serverToolsMap.set(server, []);
      }
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
  }

  /**
   * Reloads the configuration from mcp.json and reinitializes all servers
   * @throws Error if reload fails
   */
  async reloadConfig(): Promise<void> {
    try {
      // Cleanup existing servers
      await this.cleanup();

      // Reset state
      this._initialized = false;
      this._config = null;

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
  private async initializeServers(): Promise<void> {
    if (!this._config) {
      throw new Error("Config not loaded. Call loadConfig() first.");
    }

    // Then fetch and register tools for all servers
    const serverInitPromises = Array.from(this._serverToolsMap.entries()).map(
      async ([server, _]) => {
        try {
          await this.registerServerTools(server);
        } catch (error) {
          console.error(
            `Failed to initialize server ${server.id}: ${formatError(error)}`,
          );
          // Remove the failed server
          this._serverToolsMap.delete(server);
        }
      },
    );

    await Promise.all(serverInitPromises);
  }

  /**
   * Determines the connection mode for a server based on its configuration
   * @param config The server configuration
   * @returns The appropriate connection mode
   */
  private getConnectionMode(config: IMcpServerConfig): ConnectionMode {
    if ("url" in config) {
      return ConnectionMode.SSE;
    }
    return ConnectionMode.CLI;
  }

  /**
   * Registers a new MCP server and its tools
   * @param id Unique identifier for the server
   * @param config Server configuration
   * @throws Error if server registration fails or server already exists
   */
  async registerServer(id: string, config: IMcpServerConfig): Promise<void> {
    const newServer = McpServerSchema.parse({
      id,
      name: id,
      client: new McpClient({ serverName: id }),
      config,
      enabled: true, // New servers are enabled by default
    });

    if (this.getServer(id)) {
      throw new McpServerError(
        "already_exists",
        `Server with id ${id} already exists`,
        { serverId: id },
      );
    }

    try {
      // First register the server with empty tools
      this._serverToolsMap.set(newServer, []);

      // Then fetch and register its tools
      await this.registerServerTools(newServer);

      // Update mcp.json file
      if (this._config) {
        this._config.mcpServers[id] = config;
        await this.saveConfig();
      }
    } catch (error) {
      // Clean up any partial registration
      this._serverToolsMap.delete(newServer);
      throw new Error(`Failed to register server ${id}: ${formatError(error)}`);
    }
  }

  /**
   * Removes a tool from the manager
   * @param name The name of the tool to remove
   * @throws Error if tool is not found
   */
  removeTool(name: string): void {
    if (!this._toolbox.has(name)) {
      throw new Error(`Tool ${name} not found`);
    }
    this._toolbox.delete(name);
  }

  /**
   * Deregisters a server and removes its tools
   * @param id ID of the server to deregister
   * @throws Error if server is not found or deregistration fails
   */
  async deregisterServer(id: string): Promise<void> {
    const server = this.getServer(id);
    if (!server) {
      throw new Error(`Server with id ${id} not found`);
    }

    try {
      // First cleanup the server client
      await server.client.cleanup();

      // Remove all tools from toolbox
      const tools = this._serverToolsMap.get(server);
      if (tools) {
        for (const tool of tools) {
          this._toolbox.delete(tool.name);
        }
      }

      // Remove server and its tools from serverToolsMap
      this._serverToolsMap.delete(server);

      // Update mcp.json file
      if (this._config) {
        delete this._config.mcpServers[id];
        await this.saveConfig();
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
    config: IMcpServerConfig,
  ): Promise<void> {
    const server = this.getServer(id);
    if (!server) {
      throw new Error(`Server with id ${id} not found`);
    }

    try {
      // Deregister existing server
      await this.deregisterServer(id);
      // Register with new config
      await this.registerServer(id, config);
    } catch (error) {
      throw new Error(`Failed to update server ${id}: ${formatError(error)}`);
    }
  }

  /**
   * Registers a new tool
   * @param tool The tool to register
   */
  registerTool(tool: Tool): void {
    if (this._toolbox.has(tool.name)) {
      throw new Error(`Tool ${tool.name} already registered`);
    }
    this._toolbox.set(tool.name, tool);
  }

  /**
   * Cleans up all server connections and resets the manager state
   */
  async cleanup(): Promise<void> {
    // Cleanup all server clients
    for (const server of this._serverToolsMap.keys()) {
      try {
        await server.client.cleanup();
      } catch (error) {
        console.error(`Error cleaning up server ${server.id}:`, error);
      }
    }
    this._serverToolsMap.clear();
    this._toolbox.clear();
    this._initialized = false;
  }

  getAllServerWithTools(): IMcpServerApi[] {
    return Array.from(this._serverToolsMap.entries()).map(
      ([server, tools]) => ({
        id: server.id,
        name: server.name,
        enabled: server.enabled,
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
    const server = this.getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    server.enabled = enabled;
    const tools = this._serverToolsMap.get(server);
    if (enabled && tools) {
      // Re-add tools to toolbox when enabling
      for (const tool of tools) {
        this._toolbox.set(tool.name, tool);
      }
    } else if (!enabled) {
      // Remove tools from toolbox when disabling
      this.removeServerTools(serverId);
    }

    // Update the config
    if (this._config?.mcpServers[serverId]) {
      this._config.mcpServers[serverId] = {
        ...this._config.mcpServers[serverId],
        enabled,
      };
      await this.saveConfig();
    }
  }

  private getServer(id: string): IMcpServer | undefined {
    for (const server of this._serverToolsMap.keys()) {
      if (server.id === id) {
        return server;
      }
    }
    return undefined;
  }

  getServerConfig(serverId: string): IMcpServerConfig {
    const server = this.getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    // Return config without enabled property
    return server.config;
  }

  /**
   * Saves the current configuration to mcp.json
   */
  private async saveConfig(): Promise<void> {
    if (!this._config) {
      throw new Error("Config not loaded");
    }

    // Update enabled state in config for all servers
    for (const server of this._serverToolsMap.keys()) {
      const serverId = server.id;
      if (this._config.mcpServers[serverId]) {
        const currentConfig = this._config.mcpServers[serverId];
        this._config.mcpServers[serverId] = {
          ...currentConfig,
          enabled: server.enabled,
        };
      }
    }

    // Write config to file
    await Deno.writeTextFile(
      this.getConfigPath(this._configFile),
      JSON.stringify(this._config, null, 2),
    );
  }

  /**
   * Removes all tools associated with a server from the toolbox
   * @param serverId The ID of the server
   */
  private removeServerTools(serverId: string): void {
    const server = this.getServer(serverId);
    if (!server) return;
    const tools = this._serverToolsMap.get(server);
    if (tools) {
      // Only remove from toolbox, keep in serverToolsMap
      for (const tool of tools) {
        this._toolbox.delete(tool.name);
      }
    }
  }

  /**
   * Registers all tools for a server
   * @param server The server to register tools for
   */
  private async registerServerTools(server: IMcpServer): Promise<void> {
    try {
      const connectionMode = this.getConnectionMode(server.config);
      const tools = await server.client.retriveTools(
        server.config,
        connectionMode,
      );

      // Store tools in serverToolsMap regardless of enabled state
      this._serverToolsMap.set(server, tools);

      // Only add to toolbox if server is enabled
      if (server.enabled) {
        for (const tool of tools) {
          this._toolbox.set(tool.name, tool);
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to register tools for server ${server.id}: ${
          formatError(error)
        }`,
      );
    }
  }

  /**
   * Gets all registered tools from all servers
   * @returns Map of tool names to tool instances
   */
  getAllTools(): Map<string, Tool> {
    return this._toolbox;
  }

  /**
   * Gets a specific tool by name
   * @param name The name of the tool to retrieve
   * @returns The tool if found, undefined otherwise
   */
  getTool(name: string): Tool | undefined {
    return this._toolbox.get(name);
  }

  /**
   * Fetches MCP server configuration from a remote endpoint
   * @param endpoint The URL of the remote configuration endpoint
   * @param options Optional fetch options
   * @returns Promise resolving to IMcpServerConfig
   * @throws Error if the fetch fails or returns invalid configuration
   */
  async registerServerFromRegistry(id: string) {
    const url = `${this._mcpRegistryBaseUrl}/servers/${id}`;
    const response = await fetch(url);
    const config = McpServerConfigSchema.parse(await response.json());
    await this.registerServer(id, config);
  }
}
