import { McpClient } from "./McpClient.ts";
import type { Tool } from "../tools/mod.ts";
import type { McpServerEndpoint } from "./mod.ts";

/**
 * Represents the state of an MCP server including its configuration,
 * client connection, enabled status, and associated tools
 */
interface McpServerState {
  /** The server configuration */
  server: McpServerEndpoint;
  /** The MCP client instance for this server */
  client: McpClient;
  /** Whether the server is enabled */
  enabled: boolean;
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

  /**
   * Registers a new MCP server and its tools
   * @param server Server configuration (server.id is used as the key)
   * @param enabled Whether the server is enabled
   * @returns Promise that resolves when the server is fully connected and ready (if enabled)
   * @throws McpError if server registration fails or server already exists
   */
  async registerServer(
    server: McpServerEndpoint,
    enabled: boolean = true,
  ): Promise<void> {
    if (this.#serverStateMap.has(server.id)) {
      throw new Error(
        `Server ${server.id} already exists`,
      );
    }

    // Create MCP client
    const client = new McpClient(server);

    // Create server state
    const state: McpServerState = {
      server,
      client,
      enabled,
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

    const newEnabled = updates.enabled ?? state.enabled;
    const hasConfigChange = updates.server !== undefined;

    // If config changed, re-register the server
    if (hasConfigChange) {
      this.deregisterServer(serverId);
      this.registerServer(updates.server!, newEnabled);
      return;
    }

    // Otherwise, just update enabled status
    state.enabled = newEnabled;

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

    // Check if any MCP server already provides a tool with this name
    for (const [_serverId, state] of this.#serverStateMap.entries()) {
      if (state.enabled && state.client.getTool(tool.name)) {
        throw new Error(
          `Tool ${tool.name} already exists in MCP server ${state.server.id}`,
        );
      }
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
    for (const [_serverId, state] of this.#serverStateMap.entries()) {
      if (state.enabled) {
        for (const tool of state.client.tools) {
          // MCP tools take precedence over directly registered tools with same name
          allTools.set(tool.name, tool);
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
    for (const [_serverId, state] of this.#serverStateMap.entries()) {
      if (state.enabled) {
        const tool = state.client.getTool(name);
        if (tool) {
          return tool;
        }
      }
    }

    // Then check directly registered tools
    return this.#toolbox.get(name);
  }

  debugLogState(): void {
    console.log("\n=== MCP SERVER MANAGER STATE ===");
    console.log(`Number of servers: ${this.#serverStateMap.size}`);
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

    for (const [serverId, state] of this.#serverStateMap.entries()) {
      console.log(`\nServer: ${state.server.displayName || state.server.id}`);
      console.log(`  - ID: ${serverId}`);
      console.log(`  - Enabled: ${state.enabled}`);
      console.log(`  - Connected: ${state.client.connected ?? false}`);
      console.log(`  - Tools count: ${state.client.toolCount ?? 0}`);

      if (state.client.toolCount > 0) {
        console.log(
          `  - Tool names: ${state.client.tools.map((t) => t.name).join(", ")}`,
        );
      }
    }

    console.log(
      `\nAll available tools: ${Array.from(allTools.keys()).join(", ")}`,
    );
    console.log("=== END STATE ===\n");
  }
}
