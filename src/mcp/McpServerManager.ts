import { ConnectionMode, McpClient } from "./McpClient.ts";
import fs from "node:fs/promises";
import type { Tool } from "../tools/index.ts";
import { z } from "zod";
import {
  McpServerSchema,
  type IMcpServer,
  McpServerConfigSchema,
  type McpServerConfig,
} from "./types.ts";
import { formatError } from "../utils/index.ts";

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
  private _servers = new Map<string, IMcpServer>();
  private _tools = new Map<string, Tool>();
  private _initialized = false;

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

    // 2. Initialize servers and fetch their tools
    await this.initializeServers();

    this._initialized = true;
    return this;
  }

  /**
   * Gets all registered tools from all servers
   * @returns Array of all available tools
   */
  getAllTools(): Map<string, Tool> {
    return this._tools;
  }

  /**
   * Gets a specific tool by name
   * @param name The name of the tool to retrieve
   * @returns The tool if found, undefined otherwise
   */
  public getTool(name: string): Tool | undefined {
    const tool = this._tools.get(name);
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
  private getConnectionMode(config: McpServerConfig): ConnectionMode {
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
  async registerServer(id: string, config: McpServerConfig): Promise<void> {
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
            this._tools.delete(tool.name);
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
    if (!this._tools.has(name)) {
      throw new Error(`Tool ${name} not found`);
    }
    this._tools.delete(name);
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
      const toolsToRemove = Array.from(this._tools.keys()).filter((name) =>
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
  async updateServerConfig(id: string, config: McpServerConfig): Promise<void> {
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
    if (this._tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} already registered`);
    }
    this._tools.set(tool.name, tool);
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
    this._tools.clear();
    this._initialized = false;
  }
}
