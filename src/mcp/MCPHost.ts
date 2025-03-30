import { MCPClient } from "./McpClient";
import fs from "fs/promises";
import MCPServerManager from "./McpServerManager";

export interface IMCPServer {
  id: string;
  name: string;
  client: MCPClient;
  config: IMCPServerConfig;
}

interface IMCPServerConfig {
  command: string;
  args: string[];
}

interface IMCPConfig {
  mcpServers: Record<string, IMCPServerConfig>;
}

export class MCPHost {
  private config: IMCPConfig | null = null;
  private mcpServerManager = MCPServerManager.getInstance();

  /**
   * Loads the MCP configuration from a JSON file.
   * @param {string} configPath - Path to the configuration file (defaults to "mcp.json")
   * @throws {Error} If the config file cannot be read or parsed
   */
  async loadConfig(configPath = "mcp.json"): Promise<void> {
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      this.config = JSON.parse(configContent) as IMCPConfig;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to load MCP config: ${errorMessage}`);
    }
  }

  /**
   * Registers a new MCP server with the specified ID.
   * Creates a new MCPClient instance and connects it to the server.
   * @param {string} serverId - Unique identifier for the server
   * @throws {Error} If the server is already registered or configuration is missing
   */
  async registerServerWithTools(serverId: string): Promise<void> {
    if (!this.config) {
      throw new Error("MCP config not loaded. Call loadConfig() first.");
    }

    const existingServer = this.mcpServerManager.getServer(serverId);
    if (existingServer) {
      throw new Error(`Server with ID ${serverId} is already registered`);
    }

    const serverConfig = this.config.mcpServers[serverId];
    if (!serverConfig) {
      throw new Error(`No configuration found for server ID: ${serverId}`);
    }

    try {
      const client = new MCPClient();
      const tools = await client.retriveTools(serverConfig.command);

      const server: IMCPServer = {
        id: serverId,
        name: serverId,
        client,
        config: serverConfig,
      };

      this.mcpServerManager.registerServer(server, tools);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to register MCP server: ${errorMessage}`);
    }
  }

  /**
   * Registers all servers defined in the configuration.
   * @throws {Error} If configuration is not loaded or registration fails
   */
  async registerAllServers(): Promise<void> {
    if (!this.config) {
      throw new Error("MCP config not loaded. Call loadConfig() first.");
    }

    const serverIds = Object.keys(this.config.mcpServers);
    await Promise.all(serverIds.map((id) => this.registerServerWithTools(id)));
  }

  /**
   * Unregisters a server and cleans up its resources.
   * @param {string} serverId - ID of the server to unregister
   */
  async unregisterServer(serverId: string): Promise<void> {
    const server = this.mcpServerManager.getServer(serverId);
    if (!server) {
      return;
    }

    try {
      await server.client.cleanup();
      this.mcpServerManager.unregisterServer(serverId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Error unregistering server ${serverId}: ${errorMessage}`);
    }
  }
  /**
   * Cleans up all registered servers and their resources.
   * Should be called when the host is no longer needed.
   */
  async cleanup(): Promise<void> {
    const servers = this.mcpServerManager.getAllServers();
    await Promise.all(
      servers.map((server) => this.unregisterServer(server.id)),
    );
    this.mcpServerManager.clear();
  }
}
