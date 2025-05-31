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
import { ensureDir } from "@std/fs";

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
  #config: IMcpConfig | null = null;
  // toolbox only contains active tools for agent to call
  #toolbox = new Map<string, Tool>();
  // serverToolsMap maintains all tools for each server
  #serverToolsMap = new Map<IMcpServer, Tool[]>();
  #initialized = false;
  #configFile = "mcp.json";
  #dataDir: string | null = null;
  #mcpRegistryBaseUrl: string | null = null;

  async #createMcpClient(
    serverId: string,
    serverConfig: IMcpServerConfig,
  ): Promise<McpClient> {
    let oauthProvider:
      | import("./McpOAuthProvider.ts").McpOAuthProvider
      | undefined = undefined;
    const isRemoteServer = "url" in serverConfig;

    if (isRemoteServer && serverConfig.url) {
      // Dynamic imports
      const { McpOAuthProvider } = await import("./McpOAuthProvider.ts");
      const { findAvailablePort } = await import("./utils.ts");
      const callbackPort = await findAvailablePort(3001);
      oauthProvider = new McpOAuthProvider({
        serverUrl: serverConfig.url,
        callbackPort,
        oauthBaseDir: await this.getServerStoragePath(),
        clientName: "zypher-agent",
        softwareVersion: "1.0.0",
      });
    }

    return new McpClient({
      serverName: serverId,
      oAuthProvider: oauthProvider,
      retryAuthentication: true,
      maxAuthRetries: 3,
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
   * Gets the storage path for a specific server's OAuth data
   * @param serverId The ID of the server
   * @returns The path to the server's OAuth storage directory
   */
  async getServerStoragePath(): Promise<string> {
    if (!this.#dataDir) {
      throw new Error("Data directory not initialized");
    }
    const oauthBasePath = join(this.#dataDir, "oauth");

    // Ensure the base directory exists
    await ensureDir(oauthBasePath);
    return oauthBasePath;
  }

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
        const defaultConfig: IMcpConfig = {
          mcpServers: {},
        };
        await Deno.writeTextFile(
          configPath,
          JSON.stringify(defaultConfig, null, 2),
        );
        this.#config = defaultConfig;
        return;
      }

      const configContent = await Deno.readTextFile(configPath);
      const parsedConfig = JSON.parse(configContent) as Record<string, unknown>;
      this.#config = McpConfigSchema.parse(parsedConfig);

      // Create server instances with their enabled states from config
      for (
        const [serverId, serverConfig] of Object.entries(
          this.#config.mcpServers,
        )
      ) {
        const client = await this.#createMcpClient(serverId, serverConfig);
        const server = McpServerSchema.parse({
          id: serverId,
          name: serverId,
          client: client,
          config: serverConfig,
          enabled: serverConfig.enabled ?? true,
        });
        this.#serverToolsMap.set(server, []);
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

    // Then fetch and register tools for all servers
    const serverInitPromises = Array.from(this.#serverToolsMap.entries()).map(
      async ([server, _]) => {
        try {
          await this.#registerServerTools(server);
        } catch (error) {
          console.error(
            `Failed to initialize server ${server.id}: ${formatError(error)}`,
          );
          // Remove the failed server
          this.#serverToolsMap.delete(server);
        }
      },
    );

    await Promise.all(serverInitPromises);
  };

  /**
   * Determines the connection mode for a server based on its configuration
   * @param config The server configuration
   * @returns The appropriate connection mode
   */
  #getConnectionMode = (config: IMcpServerConfig): ConnectionMode => {
    if ("url" in config) {
      return ConnectionMode.SSE;
    }
    return ConnectionMode.CLI;
  };

  /**
   * Registers a new MCP server and its tools
   * @param id Unique identifier for the server
   * @param config Server configuration
   * @throws Error if server registration fails or server already exists
   */
  async registerServer(id: string, config: IMcpServerConfig): Promise<void> {
    try {
      if (!this.#config) {
        throw new Error("Config not loaded");
      }
      if (this.#getServer(id)) {
        throw new McpServerError(
          "already_exists",
          `Server ${id} already exists`,
        );
      }
      const client = await this.#createMcpClient(id, config);
      const server: IMcpServer = {
        id,
        name: id,
        client: client,
        config,
        enabled: config.enabled ?? true,
      };
      this.#serverToolsMap.set(server, []);
      await this.#registerServerTools(server);
      this.#config.mcpServers[id] = config;
      await this.#saveConfig();
    } catch (error) {
      console.error(`Failed to register server ${id}:`, formatError(error));
      throw new Error(`Failed to register server ${id}: ${formatError(error)}`);
    }
  }

  /**
   * Removes a tool from the manager
   * @param name The name of the tool to remove
   * @throws Error if tool is not found
   */
  removeTool(name: string): void {
    if (!this.#toolbox.has(name)) {
      throw new Error(`Tool ${name} not found`);
    }
    this.#toolbox.delete(name);
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
      await server.client.cleanup();

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
        delete this.#config.mcpServers[id];
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
    config: IMcpServerConfig,
  ): Promise<void> {
    const server = this.#getServer(id);
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
        await server.client.cleanup();
      } catch (error) {
        console.error(`Error cleaning up server ${server.id}:`, error);
      }
    }
    this.#serverToolsMap.clear();
    this.#toolbox.clear();
    this.#initialized = false;
  }

  getAllServerWithTools(): IMcpServerApi[] {
    return Array.from(this.#serverToolsMap.entries()).map(
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
    const server = this.#getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    server.enabled = enabled;
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
    if (this.#config?.mcpServers[serverId]) {
      this.#config.mcpServers[serverId] = {
        ...this.#config.mcpServers[serverId],
        enabled,
      };
      await this.#saveConfig();
    }
  }

  #getServer = (id: string): IMcpServer | undefined => {
    for (const server of this.#serverToolsMap.keys()) {
      if (server.id === id) {
        return server;
      }
    }
    return undefined;
  };

  getServerConfig(serverId: string): IMcpServerConfig {
    const server = this.#getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    // Return config without enabled property
    return server.config;
  }

  /**
   * Saves the current configuration to mcp.json
   */
  #saveConfig = async (): Promise<void> => {
    if (!this.#config) {
      throw new Error("Config not loaded");
    }

    // Update enabled state in config for all servers
    for (const server of this.#serverToolsMap.keys()) {
      const serverId = server.id;
      if (this.#config.mcpServers[serverId]) {
        const currentConfig = this.#config.mcpServers[serverId];
        this.#config.mcpServers[serverId] = {
          ...currentConfig,
          enabled: server.enabled,
        };
      }
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
  #registerServerTools = async (server: IMcpServer): Promise<void> => {
    try {
      console.log(`Registering tools for server: ${server.id}`);
      const connectionMode = this.#getConnectionMode(server.config);
      console.log(
        `Connection mode: ${
          connectionMode === ConnectionMode.SSE ? "SSE" : "CLI"
        }`,
      );

      console.log("Retrieving tools from server...");
      const tools = await server.client.retrieveTools(
        server.config,
        connectionMode,
      );

      console.log(`Retrieved ${tools.length} tools for server ${server.id}`);
      if (tools.length > 0) {
        console.log(`Tool names: ${tools.map((t) => t.name).join(", ")}`);
      }

      // Store tools in serverToolsMap regardless of enabled state
      this.#serverToolsMap.set(server, tools);

      // Only add to toolbox if server is enabled
      if (server.enabled) {
        console.log(
          `Server ${server.id} is enabled, adding ${tools.length} tools to toolbox`,
        );
        for (const tool of tools) {
          this.#toolbox.set(tool.name, tool);
          console.log(`Added tool to toolbox: ${tool.name}`);
        }
      } else {
        console.log(
          `Server ${server.id} is disabled, not adding tools to toolbox`,
        );
      }

      console.log(
        `Successfully registered ${tools.length} tools for server ${server.id}`,
      );
    } catch (error) {
      console.error(
        `Failed to register tools for server ${server.id}:`,
        formatError(error),
      );
      throw new Error(
        `Failed to register tools for server ${server.id}: ${
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
      console.log(`\nServer: ${server.id}`);
      console.log(`  - Name: ${server.name}`);
      console.log(`  - Enabled: ${server.enabled}`);
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

      // Parse and validate the server configuration
      const config = McpServerConfigSchema.parse(data.config);
      const name = data.name ?? id;

      // Log OAuth configuration for SSE servers
      if ("url" in config) {
        console.log(`Server ${id} is a remote SSE server at ${config.url}`);

        // Check if we have client credentials in environment variables
        const clientId = Deno.env.get(`MCP_${id.toUpperCase()}_CLIENT_ID`);
        const clientSecret = Deno.env.get(
          `MCP_${id.toUpperCase()}_CLIENT_SECRET`,
        );

        // Check for custom OAuth authorization server URL
        const authServerUrl = Deno.env.get(
          `MCP_${id.toUpperCase()}_AUTH_SERVER_URL`,
        );

        // Determine if we should use dynamic registration
        const useDynamicRegistration =
          Deno.env.get("MCP_USE_DYNAMIC_REGISTRATION") !== "false";

        if (clientId && clientSecret) {
          console.log(
            `Found OAuth client credentials for server ${id} in environment variables.`,
          );
        } else if (useDynamicRegistration) {
          console.log(
            `No client credentials found for server ${id}, will use dynamic client registration.`,
          );
        } else {
          console.warn(
            `OAuth client credentials not found in environment variables for server ${id}.`,
          );
          console.warn(
            `Set MCP_${id.toUpperCase()}_CLIENT_ID and MCP_${id.toUpperCase()}_CLIENT_SECRET environment variables or enable dynamic registration.`,
          );
        }

        if (authServerUrl) {
          console.log(
            `Using custom OAuth authorization server for ${id}: ${authServerUrl}`,
          );
        }
      }

      // Use the standard registration process for both CLI and SSE servers
      await this.registerServer(name, config);
      console.log(`Successfully registered server from registry: ${id}`);
    } catch (error) {
      console.error(`Failed to register server ${id} from registry:`, error);
      throw new Error(
        `Failed to register server ${id} from registry: ${formatError(error)}`,
      );
    }
  }

  /**
   * Clears all stored OAuth authentication data for all servers.
   */
  async clearAllOAuthData(): Promise<void> {
    if (!this.#dataDir) {
      await this.init();
      if (!this.#dataDir) {
        console.error(
          "Failed to initialize data directory. Cannot clear OAuth data.",
        );
        throw new Error("Data directory could not be initialized.");
      }
    }
    const oauthPath = join(this.#dataDir, "oauth");
    try {
      await Deno.remove(oauthPath, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.error(
          `Error removing OAuth directory ${oauthPath}:`,
          formatError(error),
        );
        throw new Error(
          `Failed to remove OAuth directory: ${formatError(error)}`,
        );
      }
    }
  }
}
