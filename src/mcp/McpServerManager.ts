import { ConnectionMode, McpClient } from "./McpClient";
import fs from "fs/promises";
import type { Tool } from "../tools";
import { z } from "zod";
import {
  McpServerSchema,
  type IMcpServer,
  McpServerConfigSchema,
  type IMcpServerConfig,
} from "./types";
import { formatError } from "../utils";

const McpConfigSchema = z.object({
  mcpServers: z.record(McpServerConfigSchema),
});

const ServerStatusSchema = z.record(z.string(), z.boolean());

type IMcpConfig = z.infer<typeof McpConfigSchema>;
type ServerStatusMap = z.infer<typeof ServerStatusSchema>;

/**
 * McpServerManager is a class that manages MCP (Model Context Protocol) servers and their tools.
 * It handles server registration, tool management, and configuration persistence.
 */
export class McpServerManager {
  private _config: IMcpConfig | null = null;
  private _servers = new Map<string, IMcpServer>();
  private _toolbox = new Map<string, Tool>();
  private _serverToolsMap = new Map<string, Set<string>>();
  private _initialized = false;
  private _serverStatusFile = "server-status.json";

  /**
   * Initializes the McpServerManager by loading configuration and setting up servers
   * @returns The initialized McpServerManager instance
   */
  async init() {
    if (this._initialized) {
      return this;
    }

    // 1. Read and parse server configs from mcp.json
    await this.loadConfig();

    // 2. Load server statuses
    await this.loadServerStatuses();

    // 3. Initialize servers and fetch their tools
    await this.initializeServers();

    this._initialized = true;
    return this;
  }

  /**
   * Loads server statuses from the status file
   */
  private async loadServerStatuses(): Promise<void> {
    try {
      try {
        await fs.access(this._serverStatusFile);
      } catch {
        // Create default status file if it doesn't exist
        const defaultStatuses: ServerStatusMap = {};
        await fs.writeFile(
          this._serverStatusFile,
          JSON.stringify(defaultStatuses, null, 2),
        );
        return;
      }

      const statusContent = await fs.readFile(this._serverStatusFile, "utf-8");
      const statuses = ServerStatusSchema.parse(JSON.parse(statusContent));

      // Apply statuses to existing servers
      for (const [serverId, status] of Object.entries(statuses)) {
        const server = this._servers.get(serverId);
        if (server) {
          server.enabled = status;
          if (!status) {
            // Remove tools if server is disabled
            this.removeServerTools(serverId);
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to load server statuses: ${formatError(error)}`);
    }
  }

  /**
   * Saves current server statuses to the status file
   */
  private async saveServerStatuses(): Promise<void> {
    const statuses: ServerStatusMap = {};
    for (const [id, server] of this._servers.entries()) {
      statuses[id] = server.enabled;
    }
    await fs.writeFile(
      this._serverStatusFile,
      JSON.stringify(statuses, null, 2),
    );
  }

  /**
   * Sets the status of a server
   * @param serverId The ID of the server
   * @param enabled Whether the server should be enabled
   */
  async setServerStatus(serverId: string, enabled: boolean): Promise<void> {
    const server = this._servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    server.enabled = enabled;
    if (!enabled) {
      this.removeServerTools(serverId);
    } else {
      // Re-register tools if server is enabled
      await this.registerServerTools(server);
    }

    await this.saveServerStatuses();
  }

  /**
   * Gets the status of a server
   * @param serverId The ID of the server
   * @returns The server's enabled status
   */
  getServerStatus(serverId: string): boolean {
    const server = this._servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    return server.enabled;
  }

  /**
   * Removes all tools associated with a server from the toolbox
   * @param serverId The ID of the server
   */
  private removeServerTools(serverId: string): void {
    const toolNames = this._serverToolsMap.get(serverId);
    if (toolNames) {
      for (const toolName of toolNames) {
        this._toolbox.delete(toolName);
      }
    }
  }

  /**
   * Registers all tools for a server
   * @param server The server to register tools for
   */
  private async registerServerTools(server: IMcpServer): Promise<void> {
    if (!server.enabled) {
      return;
    }

    try {
      const connectionMode = this.getConnectionMode(server.config);
      const tools = await server.client.retriveTools(
        server.config,
        connectionMode,
      );
      const serverTools = new Set<string>();

      for (const tool of tools) {
        const toolName = `mcp_${server.id}_${tool.name}`;
        this._toolbox.set(toolName, tool);
        serverTools.add(toolName);
      }

      this._serverToolsMap.set(server.id, serverTools);
    } catch (error) {
      throw new Error(
        `Failed to register tools for server ${server.id}: ${formatError(error)}`,
      );
    }
  }

  /**
   * Gets all registered tools from all servers
   * @returns Array of all available tools
   */
  getAllTools(): Map<string, Tool> {
    return this._toolbox;
  }

  /**
   * Gets a specific tool by name
   * @param name The name of the tool to retrieve
   * @returns The tool if found, undefined otherwise
   */
  public getTool(name: string): Tool | undefined {
    const tool = this._toolbox.get(name);
    return tool;
  }

  /**
   * Loads and validates the MCP configuration from mcp.json
   * @param configPath Path to the configuration file
   * @throws Error if config file is invalid or cannot be loaded
   */
  private async loadConfig(configPath = "mcp.json"): Promise<void> {
    try {
      try {
        await fs.access(configPath);
      } catch {
        const defaultConfig: IMcpConfig = { mcpServers: {} };
        await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
        this._config = defaultConfig;
        return;
      }

      const configContent = await fs.readFile(configPath, "utf-8");
      const parsedConfig = JSON.parse(configContent) as Record<string, unknown>;
      this._config = McpConfigSchema.parse(parsedConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid MCP config structure: ${formatError(error)}`);
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
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
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
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

    // First create all server instances
    for (const [id, serverConfig] of Object.entries(this._config.mcpServers)) {
      const server = McpServerSchema.parse({
        id,
        name: id,
        client: new McpClient({ serverName: id }),
        config: serverConfig,
      });
      this._servers.set(id, server);
    }

    // Then fetch and register tools for all servers
    const serverInitPromises = Array.from(this._servers.entries()).map(
      async ([id, server]) => {
        try {
          const connectionMode = this.getConnectionMode(server.config);
          const tools = await server.client.retriveTools(
            server.config,
            connectionMode,
          );
          // Register each tool
          for (const tool of tools) {
            try {
              this.registerTool(tool);
            } catch (error) {
              // Skip duplicate tools without logging warnings
              if (
                !(
                  error instanceof Error &&
                  error.message.includes("already registered")
                )
              ) {
                console.error(
                  `Failed to register tool ${tool.name} from server ${id}:`,
                  error,
                );
              }
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`Failed to initialize server ${id}: ${errorMessage}`);
          // Remove the failed server
          this._servers.delete(id);
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
    if (this._servers.has(id)) {
      throw new Error(`Server with id ${id} already exists`);
    }

    const server = McpServerSchema.parse({
      id,
      name: id,
      client: new McpClient({ serverName: id }),
      config,
    });

    try {
      const connectionMode = this.getConnectionMode(config);
      const tools = await server.client.retriveTools(config, connectionMode);

      // Register each tool
      tools.forEach((tool) => this.registerTool(tool));

      this._servers.set(id, server);

      // Update mcp.json file
      if (this._config) {
        try {
          this._config.mcpServers[id] = config;
          await fs.writeFile("mcp.json", JSON.stringify(this._config, null, 2));
        } catch (error) {
          // Rollback server registration if file write fails
          this._servers.delete(id);
          for (const tool of tools) {
            this._toolbox.delete(tool.name);
          }
          throw new Error(`Failed to update mcp.json: ${formatError(error)}`);
        }
      }
    } catch (error) {
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
    const server = this._servers.get(id);
    if (!server) {
      throw new Error(`Server with id ${id} not found`);
    }

    try {
      // First cleanup the server client
      await server.client.cleanup();

      // Remove all tools associated with this server
      const toolPrefix = `mcp_${id}_`;
      const toolsToRemove = Array.from(this._toolbox.keys()).filter((name) =>
        name.startsWith(toolPrefix),
      );

      toolsToRemove.forEach((toolName) => this.removeTool(toolName));

      // Remove the server
      this._servers.delete(id);

      // Update mcp.json file
      if (this._config) {
        try {
          delete this._config.mcpServers[id];
          await fs.writeFile("mcp.json", JSON.stringify(this._config, null, 2));
        } catch (error) {
          // Rollback server deregistration if file write fails
          this._servers.set(id, server);
          // Note: We don't need to restore tools as they will be re-registered
          // when the server is re-registered
          throw new Error(`Failed to update mcp.json: ${formatError(error)}`);
        }
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
    const server = this._servers.get(id);
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
   * Gets all registered servers
   * @returns Map of server IDs to server instances
   */
  getAllServers(): Map<string, IMcpServer> {
    return this._servers;
  }

  /**
   * Cleans up all server connections and resets the manager state
   */
  async cleanup(): Promise<void> {
    // Cleanup all server clients
    for (const server of this._servers.values()) {
      try {
        await server.client.cleanup();
      } catch (error) {
        console.error(`Error cleaning up server ${server.id}:`, error);
      }
    }

    this._servers.clear();
    this._toolbox.clear();
    this._initialized = false;
  }
}
