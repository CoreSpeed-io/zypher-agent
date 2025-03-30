import { MCPClient } from "./MCPClient";
import fs from "fs/promises";

interface IMCPServerConfig {
  command: string;
  args: string[];
}

interface IMCPConfig {
  mcpServers: Record<string, IMCPServerConfig>;
}

interface IMCPServer {
  id: string;
  name: string;
  client: MCPClient;
  config: IMCPServerConfig;
}

export class MCPHost {
  private servers = new Map<string, IMCPServer>();
  private toolToServer = new Map<string, string>();
  private config: IMCPConfig | null = null;

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
  async registerServer(serverId: string): Promise<void> {
    if (!this.config) {
      throw new Error("MCP config not loaded. Call loadConfig() first.");
    }

    if (this.servers.has(serverId)) {
      throw new Error(`Server with ID ${serverId} is already registered`);
    }

    const serverConfig = this.config.mcpServers[serverId];
    if (!serverConfig) {
      throw new Error(`No configuration found for server ID: ${serverId}`);
    }

    try {
      const client = new MCPClient();
      await client.connectToServer(serverConfig.command, serverConfig.args);

      const server: IMCPServer = {
        id: serverId,
        name: serverId,
        client,
        config: serverConfig,
      };

      this.servers.set(serverId, server);

      // Map tools to server
      for (const tool of client.tools) {
        this.toolToServer.set(tool.name, serverId);
      }
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
    await Promise.all(serverIds.map((id) => this.registerServer(id)));
  }

  /**
   * Unregisters a server and cleans up its resources.
   * @param {string} serverId - ID of the server to unregister
   */
  async unregisterServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      return;
    }

    try {
      // Remove tool mappings
      for (const tool of server.client.tools) {
        this.toolToServer.delete(tool.name);
      }

      // Cleanup the client
      await server.client.cleanup();

      // Remove server from registry
      this.servers.delete(serverId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Error unregistering server ${serverId}: ${errorMessage}`);
    }
  }

  /**
   * Gets the server instance that provides the specified tool.
   * @param {string} toolName - Name of the tool
   * @returns {IMCPServer | undefined} The server instance or undefined if not found
   */
  getServerForTool(toolName: string): IMCPServer | undefined {
    const serverId = this.toolToServer.get(toolName);
    if (!serverId) {
      return undefined;
    }
    return this.servers.get(serverId);
  }

  /**
   * Processes a query using the appropriate tool and server.
   * @param {string} toolName - Name of the tool to use
   * @param {string} query - Query to process
   * @returns {Promise<string>} The processed result
   * @throws {Error} If no server is found for the tool
   */
  async processQuery(toolName: string, query: string): Promise<string> {
    const server = this.getServerForTool(toolName);
    if (!server) {
      throw new Error(`No server found for tool: ${toolName}`);
    }
    return server.client.processQuery(query);
  }

  /**
   * Cleans up all registered servers and their resources.
   * Should be called when the host is no longer needed.
   */
  async cleanup(): Promise<void> {
    const serverIds = Array.from(this.servers.keys());
    await Promise.all(serverIds.map((id) => this.unregisterServer(id)));
  }
}
