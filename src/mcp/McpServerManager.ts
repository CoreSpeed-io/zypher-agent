import { McpClient } from "./McpClient.ts";
import type { Tool } from "../tools/mod.ts";
import { z } from "zod";
import { type ServerDetail, ServerDetailSchema } from "./types/store.ts";
import { getWorkspaceDataDir } from "../utils/mod.ts";
import { join } from "@std/path";
import { formatError } from "../error.ts";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { ZypherMcpServer } from "./types/local.ts";

export class McpServerError extends Error {
  constructor(
    public code: "already_exists" | "oauth_required" | "auth_failed",
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "McpServerError";
  }
}

const McpConfigSchema = z.object({
  mcpServers: z.record(z.object({
    id: z.string(),
    name: z.string(),
    config: ServerDetailSchema,
  })),
});

type IMcpConfig = z.infer<typeof McpConfigSchema>;

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
 * OAuth authentication is handled by the application layer via the optional oauthProviderFactory.
 */
export class McpServerManager {
  #config: IMcpConfig | null = null;
  // toolbox only contains active tools for agent to call
  // serverToolsMap maintains all tools for each server
  #serverToolsMap = new Map<ServerDetail, Tool[]>();
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
    return new McpClient({
      id: server._id,
      serverName: server.name,
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

      // Handle legacy config format where servers were stored as Record<string, IMcpServerConfig>
      if (
        parsedConfig.mcpServers && typeof parsedConfig.mcpServers === "object"
      ) {
        const mcpServers = parsedConfig.mcpServers as Record<string, unknown>;
        const transformedServers: Record<
          string,
          { id: string; name: string; config: IMcpServerConfig }
        > = {};

        for (const [serverId, serverData] of Object.entries(mcpServers)) {
          // Check if this is legacy format (direct config) or new format (with id, name, config)
          if (
            serverData && typeof serverData === "object" &&
            "id" in serverData && "name" in serverData && "config" in serverData
          ) {
            // New format
            transformedServers[serverId] = serverData as {
              id: string;
              name: string;
              config: IMcpServerConfig;
            };
          } else {
            // Legacy format - convert to new format
            transformedServers[serverId] = {
              id: serverId,
              name: serverId,
              config: serverData as IMcpServerConfig,
            };
          }
        }

        parsedConfig.mcpServers = transformedServers;
      }

      this.#config = McpConfigSchema.parse(parsedConfig);

      // Create server instances with their enabled states from config
      for (
        const serverData of Object.values(
          this.#config.mcpServers,
        )
      ) {
        const client = await this.#createMcpClient(
          serverData.id,
          serverData.name,
          serverData.config,
        );
        const server = McpServerSchema.parse({
          id: serverData.id,
          name: serverData.name,
          client: client,
          config: serverData.config,
          enabled: serverData.config.enabled ?? true,
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
   * Check if an error is an authentication-related error
   */
  #isAuthenticationError = (error: unknown): boolean => {
    const errorStr = formatError(error).toLowerCase();
    return errorStr.includes("401") ||
      errorStr.includes("unauthorized") ||
      errorStr.includes("authentication") ||
      errorStr.includes("non-200 status code (401)") ||
      errorStr.includes("please use the new oauth flow") ||
      errorStr.includes("generateauthurl") ||
      errorStr.includes("oauth flow") ||
      errorStr.includes("oauth") ||
      errorStr.includes("auth") ||
      errorStr.includes("generate auth url") ||
      errorStr.includes("process callback");
  };

  /**
   * Check if a server supports OAuth by looking for OAuth metadata
   */
  #checkOAuthSupport = async (serverUrl: string): Promise<boolean> => {
    try {
      const url = new URL(serverUrl);
      const metadataUrl = new URL(
        `${url.origin}/.well-known/oauth-authorization-server`,
      );

      console.log(`Checking OAuth support at: ${metadataUrl.href}`);

      const response = await fetch(metadataUrl.href, {
        method: "HEAD", // Just check if the endpoint exists
      });

      return response.ok;
    } catch (error) {
      console.log(`OAuth metadata check failed: ${formatError(error)}`);
      return false;
    }
  };

  /**
   * Check if a server is open (accessible without authentication)
   */
  #checkOpenServerAccess = async (serverUrl: string): Promise<boolean> => {
    try {
      console.log(`Testing open access to: ${serverUrl}`);

      // Try a simple GET request to see if the server responds
      const response = await fetch(serverUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      });

      // If we get a 200 or other non-auth error, server might be open
      if (response.ok) {
        console.log(`✅ Server appears to be open (${response.status})`);
        return true;
      }

      // Check if it's specifically an auth error
      if (response.status === 401 || response.status === 403) {
        console.log(`🔒 Server requires authentication (${response.status})`);
        return false;
      }

      // Other errors might indicate server is reachable but has different endpoint structure
      console.log(
        `⚠️ Server responded with ${response.status}, might still be open`,
      );
      return true; // Give it the benefit of the doubt
    } catch (error) {
      console.log(`❌ Failed to access server: ${formatError(error)}`);
      return false;
    }
  };

  /**
   * Registers a new MCP server and its tools
   * @param id Unique identifier for the server
   * @param config Server configuration
   * @throws Error if server registration fails or server already exists
   */
  async registerServer(
    id: string,
    config: IMcpServerConfig,
    options?: { serverName?: string },
  ): Promise<void> {
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
      const client = await this.#createMcpClient(
        id,
        options?.serverName ?? id,
        config,
      );
      const server: IMcpServer = {
        id,
        name: options?.serverName ?? id,
        client: client,
        config,
        enabled: config.enabled ?? true,
      };
      this.#serverToolsMap.set(server, []);

      // Try to register server tools - this is where OAuth errors occur
      try {
        await this.#registerServerTools(server);
      } catch (error) {
        // Check if this is an authentication error for SSE servers
        if (this.#isAuthenticationError(error) && "url" in config) {
          // Remove the partially registered server
          this.#serverToolsMap.delete(server);
          await server.client.cleanup();

          console.log(
            `🔍 Authentication failed for ${id}, checking server capabilities...`,
          );

          // Check if the error message explicitly mentions OAuth
          const errorStr = formatError(error).toLowerCase();
          if (
            errorStr.includes("oauth") ||
            errorStr.includes("generateauthurl") ||
            errorStr.includes("auth url")
          ) {
            console.log(
              "✅ OAuth support detected from error message - triggering OAuth flow",
            );
            throw new McpServerError(
              "oauth_required",
              `Server ${id} requires OAuth authentication. Please complete OAuth flow first.`,
              {
                serverId: id,
                serverUrl: config.url,
                requiresOAuth: true,
              },
            );
          }

          // Check if server supports OAuth
          const oauthSupported = await this.#checkOAuthSupport(config.url);

          if (oauthSupported) {
            throw new McpServerError(
              "oauth_required",
              `Server ${id} requires OAuth authentication. Please complete OAuth flow first.`,
              {
                serverId: id,
                serverUrl: config.url,
                requiresOAuth: true,
              },
            );
          }

          // Check if server might be open/accessible without auth
          const isOpenServer = await this.#checkOpenServerAccess(config.url);

          if (isOpenServer) {
            console.log(`🌐 Retrying registration for ${id} as open server...`);

            // Try to create a new client with allowOpenAccess enabled
            try {
              const openClient = await this.#createMcpClientWithOpenAccess(
                id,
                options?.serverName ?? id,
                config,
              );

              const openServer: IMcpServer = {
                id,
                name: options?.serverName ?? id,
                client: openClient,
                config,
                enabled: config.enabled ?? true,
              };

              this.#serverToolsMap.set(openServer, []);
              await this.#registerServerTools(openServer);

              // If successful, save the config and return
              this.#config.mcpServers[id] = {
                id: id,
                name: openServer.name,
                config: config,
              };
              await this.#saveConfig();
              console.log(`✅ Successfully registered open server: ${id}`);
              return;
            } catch (openError) {
              console.error(
                `Failed to register as open server: ${formatError(openError)}`,
              );
              // Fall through to regular error handling
            }
          }

          throw new McpServerError(
            "auth_failed",
            `Server ${id} authentication failed and OAuth is not supported.`,
            { serverId: id, serverUrl: config.url },
          );
        }
        // Re-throw if not an auth error
        throw error;
      }

      this.#config.mcpServers[id] = {
        id: id,
        name: server.name,
        config: config,
      };
      await this.#saveConfig();
    } catch (error) {
      // Don't log OAuth-related errors as generic failures
      if (
        error instanceof McpServerError &&
        (error.code === "oauth_required" || error.code === "auth_failed")
      ) {
        throw error;
      }
      console.error(`Failed to register server ${id}:`, formatError(error));
      throw new Error(`Failed to register server ${id}: ${formatError(error)}`);
    }
  }

  /**
   * Create MCP client with open access enabled for servers that don't require auth
   */
  async #createMcpClientWithOpenAccess(
    serverId: string,
    serverName: string,
    serverConfig: IMcpServerConfig,
  ): Promise<McpClient> {
    let oauthProvider: OAuthClientProvider | undefined = undefined;
    const isRemoteServer = "url" in serverConfig;

    if (isRemoteServer && serverConfig.url && this.#oauthProviderFactory) {
      console.log(
        `Creating OAuth provider with open access for server ${serverId}`,
      );
      oauthProvider = await this.#oauthProviderFactory(
        serverId,
        serverConfig.url,
        this.#clientName,
      );

      // Enable open access if the provider supports it
      if (oauthProvider && "config" in oauthProvider && oauthProvider.config) {
        (oauthProvider.config as { allowOpenAccess?: boolean })
          .allowOpenAccess = true;
      }
    }

    return new McpClient({
      id: serverId,
      serverName: serverName,
      oAuthProvider: oauthProvider,
    });
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
      // Store the original server name before deregistering
      const originalServerName = server.name;

      // Deregister existing server
      await this.deregisterServer(id);
      // Register with new config but preserve the original name
      await this.registerServer(id, config, { serverName: originalServerName });
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
      const serverData = this.#config.mcpServers[serverId];
      this.#config.mcpServers[serverId] = {
        id: serverData.id,
        name: serverData.name,
        config: {
          ...serverData.config,
          enabled,
        },
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

  /**
   * Get server by name (serverName)
   * @param serverName The name of the server to find
   * @returns The server if found, undefined otherwise
   */
  #getServerByName = (serverName: string): IMcpServer | undefined => {
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
    await this.deregisterServer(server.id);
  }

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

    // Update server configurations with current server state
    for (const server of this.#serverToolsMap.keys()) {
      const serverId = server.id;
      this.#config.mcpServers[serverId] = {
        id: server.id,
        name: server.name,
        config: {
          ...server.config,
          enabled: server.enabled,
        },
      };
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
      console.log(`Registering tools for server: ${server.name}`);
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

      // Check if this is an OAuth-related error that should be handled specially
      if (this.#isAuthenticationError(error)) {
        console.log(
          `Detected authentication error for server ${server.id}, will trigger OAuth flow`,
        );
        // Don't wrap OAuth errors - let them propagate as-is for proper handling
        throw error;
      }

      // For non-OAuth errors, wrap them with additional context
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

      // Parse and validate the server configuration (handles nested structures automatically)
      const parsed = McpServerRegistryConfigSchema.parse(data.config);
      const config = parsed.config;
      const extractedName = parsed.extractedName;

      // Use friendly name for server registration if available, otherwise use registry ID
      const serverName = extractedName || data.name || id;
      console.log(
        `Registering server as: ${serverName}${
          extractedName ? " (friendly name extracted from config)" : ""
        }`,
      );

      // Log OAuth configuration for SSE servers
      if ("url" in config) {
        console.log(
          `Server ${serverName} is a remote SSE server at ${config.url}`,
        );

        // Use server name for environment variables
        const clientId = Deno.env.get(
          `MCP_${serverName.toUpperCase()}_CLIENT_ID`,
        );
        const clientSecret = Deno.env.get(
          `MCP_${serverName.toUpperCase()}_CLIENT_SECRET`,
        );

        // Check for custom OAuth authorization server URL
        const authServerUrl = Deno.env.get(
          `MCP_${serverName.toUpperCase()}_AUTH_SERVER_URL`,
        );

        // Determine if we should use dynamic registration
        const useDynamicRegistration =
          Deno.env.get("MCP_USE_DYNAMIC_REGISTRATION") !== "false";

        if (clientId && clientSecret) {
          console.log(
            `Found OAuth client credentials for server ${serverName} in environment variables.`,
          );
        } else if (useDynamicRegistration) {
          console.log(
            `No client credentials found for server ${serverName}, will use dynamic client registration.`,
          );
        } else {
          console.warn(
            `OAuth client credentials not found in environment variables for server ${serverName}.`,
          );
          console.warn(
            `Set MCP_${serverName.toUpperCase()}_CLIENT_ID and MCP_${serverName.toUpperCase()}_CLIENT_SECRET environment variables or enable dynamic registration.`,
          );
        }

        if (authServerUrl) {
          console.log(
            `Using custom OAuth authorization server for ${serverName}: ${authServerUrl}`,
          );
        }
      }

      // Use the friendly name for server registration (affects tool names)
      await this.registerServer(id, config, { serverName: serverName });
      console.log(
        `Successfully registered server from registry: ${id}${
          extractedName ? ` as '${serverName}'` : ""
        }`,
      );
    } catch (error) {
      // Don't wrap OAuth-related errors - let them propagate directly
      if (
        error instanceof McpServerError &&
        (error.code === "oauth_required" || error.code === "auth_failed")
      ) {
        throw error;
      }
      console.error(`Failed to register server ${id} from registry:`, error);
      throw new Error(
        `Failed to register server ${id} from registry: ${formatError(error)}`,
      );
    }
  }

  /**
   * Retry server registration after OAuth authentication is completed
   * This method attempts to register a server that previously failed due to OAuth requirements
   * @param id Unique identifier for the server
   * @param config Server configuration
   * @throws Error if server registration fails
   */
  async retryServerRegistrationWithOAuth(
    id: string,
    config: IMcpServerConfig,
  ): Promise<void> {
    console.log(`Retrying server registration with OAuth for server: ${id}`);

    // First check if we already have this server registered
    const existingServer = this.#getServer(id);
    if (existingServer) {
      console.log(`Server ${id} already exists, updating configuration...`);
      await this.updateServerConfig(id, config);
      return;
    }

    // Attempt fresh registration - OAuth tokens should now be available
    await this.registerServer(id, config);
    console.log(
      `Successfully registered server ${id} with OAuth authentication`,
    );
  }
}
