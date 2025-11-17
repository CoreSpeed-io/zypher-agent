import { McpClient } from "./McpClient.ts";
import type { Tool } from "../tools/mod.ts";
import type { McpServerEndpoint } from "./mod.ts";
import type { ZypherContext } from "../ZypherAgent.ts";
import McpStoreSDK from "@corespeed/mcp-store-client";
import type { Server } from "@corespeed/mcp-store-client";
import { convertServerDetailToEndpoint } from "./utils.ts";

/**
 * Metadata about where an MCP server came from
 *
 * - `registry`: Server was registered from the MCP Store registry.
 *   Contains the package identifier (e.g., "@modelcontextprotocol/server-filesystem")
 * - `direct`: Server was registered directly by the user with explicit configuration
 */
type McpServerSource =
  | { type: "registry"; packageIdentifier: string }
  | { type: "direct" };

/**
 * Represents the state of an MCP server including its configuration,
 * client connection, and source information.
 */
interface McpServerState {
  /** The server configuration */
  server: McpServerEndpoint;
  /** Metadata about the source of this server */
  source: McpServerSource;
  /** The MCP client instance for this server */
  client: McpClient;
}

/**
 * McpServerManager is a class that manages MCP (Model Context Protocol) servers and their tools.
 * It handles server registration, tool management, and configuration persistence.
 *
 * Authentication is handled by the McpClient layer.
 */
export class McpServerManager {
  // Unified state map containing server config, client, and enabled status
  #serverStateMap = new Map<string, McpServerState>();
  // toolbox for directly registered tools (non-MCP tools)
  #toolbox: Map<string, Tool> = new Map();
  // MCP Store client for discovering servers (defaults to CoreSpeed MCP Store)
  #registryClient: McpStoreSDK;

  constructor(
    readonly context: ZypherContext,
    registryClient?: McpStoreSDK,
  ) {
    // Default to CoreSpeed MCP Store if none provided
    this.#registryClient = registryClient ?? new McpStoreSDK({
      baseURL: Deno.env.get("MCP_STORE_BASE_URL") ??
        "https://api1.mcp.corespeed.io",
      // The api key is only for admin endpoints. It's not needed for the public endpoints.
      apiKey: "",
    });
  }

  /**
   * Registers a new MCP server and its tools
   * @param server Server configuration (server.id is used as the key)
   * @param enabled Whether the server is enabled
   * @param source Metadata about the source of this server
   * @returns Promise that resolves when the server is fully connected and ready (if enabled)
   * @throws McpError if server registration fails or server already exists
   */
  async registerServer(
    server: McpServerEndpoint,
    enabled: boolean = true,
    source: McpServerSource = { type: "direct" },
  ): Promise<void> {
    if (this.#serverStateMap.has(server.id)) {
      throw new Error(
        `Server ${server.id} already exists`,
      );
    }

    // Create MCP client
    const client = new McpClient(this.context, server);

    // Create server state
    const state: McpServerState = {
      server,
      client,
      source,
    };
    this.#serverStateMap.set(server.id, state);

    // Set enabled state
    state.client.desiredEnabled = enabled;

    // Wait for connection to be ready if enabled
    if (enabled) {
      await state.client.waitForConnection();
    }
  }

  /**
   * All currently registered MCP servers.
   * @returns A readonly array of readonly McpServerState objects. Callers can access
   *   the live `client` for subscriptions but cannot mutate the state objects.
   */
  get servers(): ReadonlyArray<Readonly<McpServerState>> {
    return Array.from(this.#serverStateMap.values());
  }

  /**
   * Lists servers from the configured registry with cursor-based pagination
   * @param options Pagination options (cursor and limit)
   * @returns Promise that resolves to a cursor page containing server details and next cursor
   */
  async listRegistryServers(options?: {
    cursor?: string;
    limit?: number;
  }): Promise<Server[]> {
    const response = await this.#registryClient.servers.list({
      cursor: options?.cursor,
      limit: options?.limit ?? 20,
    });

    return response.servers;
  }

  /**
   * Registers a server from the configured registry by package identifier
   * @param packageIdentifier The package identifier in the format "@scope/package-name" (e.g., "@modelcontextprotocol/server-filesystem")
   * @param enabled Whether the server is enabled (defaults to true)
   * @returns Promise that resolves when the server is fully connected and ready (if enabled)
   * @throws Error if server not found in registry or registration fails
   */
  async registerServerFromRegistry(
    packageIdentifier: string,
    enabled: boolean = true,
  ): Promise<void> {
    // Parse package identifier format: @scope/package-name
    const packageMatch = packageIdentifier.match(/^@([^/]+)\/(.+)$/);
    if (!packageMatch) {
      throw new Error(
        `Invalid package identifier: ${packageIdentifier}. Expected @scope/package-name format.`,
      );
    }

    const scope = packageMatch[1];
    const packageName = packageMatch[2];

    // Fetch server by scope and package name
    const response = await this.#registryClient.servers.retrieveByPackage(
      packageName,
      { scope },
    );

    const server = convertServerDetailToEndpoint(response.server);

    // Register the server
    await this.registerServer(server, enabled, {
      type: "registry",
      packageIdentifier,
    });
  }

  /**
   * Deregisters a server and removes its tools
   * @param id ID of the server to deregister
   * @throws Error if server is not found or deregistration fails
   */
  deregisterServer(id: string): void {
    const state = this.#serverStateMap.get(id);
    if (!state) {
      throw new Error(
        `Server with id ${id} not found`,
      );
    }

    // First disable the client (disconnects and cleans up resources)
    state.client.desiredEnabled = false;

    // TODO: should we wait for the client to be disconnected?

    // Remove server state
    this.#serverStateMap.delete(id);
  }

  /**
   * Updates server configuration and/or enabled status
   * @param serverId The ID of the server
   * @param updates Object containing server config and/or enabled status to update
   * @throws Error if server is not found or update fails
   */
  updateServer(
    serverId: string,
    updates: {
      server?: McpServerEndpoint;
      enabled?: boolean;
    },
  ): void {
    const state = this.#serverStateMap.get(serverId);
    if (!state) {
      throw new Error(
        `Server ${serverId} not found`,
      );
    }

    const newEnabled = updates.enabled ?? state.client.desiredEnabled;
    const hasConfigChange = updates.server !== undefined;

    // If config changed, re-register the server
    if (hasConfigChange) {
      this.deregisterServer(serverId);
      this.registerServer(updates.server!, newEnabled);
      return;
    }

    // Otherwise, just update enabled status
    // Use client's desiredEnabled = method to handle connection lifecycle
    state.client.desiredEnabled = newEnabled;
  }

  /**
   * Registers a new tool directly (non-MCP tool)
   * @param tool The tool to register
   */
  registerTool(tool: Tool): void {
    if (this.#toolbox.has(tool.name)) {
      throw new Error(
        `Tool ${tool.name} already registered`,
      );
    }

    this.#toolbox.set(tool.name, tool);
  }

  /**
   * Cleans up all server connections and resets the manager state
   */
  cleanup(): void {
    // Cleanup all server clients
    for (const [_, state] of this.#serverStateMap.entries()) {
      state.client.desiredEnabled = false;
    }
    // TODO: should we wait for the clients to be disconnected?
    this.#serverStateMap.clear();
    this.#toolbox.clear();
  }

  /**
   * All registered tools from all enabled servers and directly registered tools
   * @returns Map of tool names to tool instances
   */
  get tools(): Map<string, Tool> {
    const allTools = new Map<string, Tool>();

    // Add tools from enabled MCP servers first
    for (const [_serverId, state] of this.#serverStateMap.entries()) {
      if (state.client.desiredEnabled) {
        for (const tool of state.client.tools) {
          allTools.set(tool.name, tool);
        }
      }
    }

    // Add directly registered (built-in) tools last - they take precedence in case of conflicts
    for (const [name, tool] of this.#toolbox) {
      allTools.set(name, tool);
    }

    return allTools;
  }

  /**
   * Gets a specific tool by name from directly registered tools or any enabled server
   * @param name The name of the tool to retrieve
   * @returns The tool if found, undefined otherwise
   */
  getTool(name: string): Tool | undefined {
    // Check directly registered (built-in) tools first - they take precedence
    const builtInTool = this.#toolbox.get(name);
    if (builtInTool) {
      return builtInTool;
    }

    // Then check MCP servers
    for (const [_serverId, state] of this.#serverStateMap.entries()) {
      if (state.client.desiredEnabled) {
        const tool = state.client.getTool(name);
        if (tool) {
          return tool;
        }
      }
    }

    return undefined;
  }

  debugLogState(): void {
    console.log("\n=== MCP SERVER MANAGER STATE ===");
    console.log(`Number of servers: ${this.#serverStateMap.size}`);
    console.log(`Number of directly registered tools: ${this.#toolbox.size}`);

    console.log(`Total number of tools: ${this.tools.size}`);

    if (this.#toolbox.size > 0) {
      console.log(
        `\nDirectly registered tools: ${
          Array.from(this.#toolbox.keys()).join(", ")
        }`,
      );
    }

    for (const [serverId, state] of this.#serverStateMap.entries()) {
      console.log(`\nServer: ${state.server.displayName ?? state.server.id}`);
      console.log(`  - ID: ${serverId}`);
      console.log(`  - Enabled: ${state.client.desiredEnabled}`);
      console.log(`  - Connected: ${state.client.connected ?? false}`);
      console.log(`  - Tools count: ${state.client.toolCount ?? 0}`);

      if (state.client.toolCount > 0) {
        console.log(
          `  - Tool names: ${state.client.tools.map((t) => t.name).join(", ")}`,
        );
      }
    }

    console.log(
      `\nAll available tools: ${Array.from(this.tools.keys()).join(", ")}`,
    );
    console.log("=== END STATE ===\n");
  }
}
