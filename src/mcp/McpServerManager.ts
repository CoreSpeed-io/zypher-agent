import { McpClient } from "./McpClient.ts";
import type { Tool } from "../tools/mod.ts";
import type { McpServerEndpoint } from "./mod.ts";
import type { ZypherContext } from "../ZypherAgent.ts";
import type { Logger } from "@logtape/logtape";

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
  readonly #context: ZypherContext;
  readonly #logger: Logger;

  // Unified state map containing server config, client, and enabled status
  #serverStateMap = new Map<string, McpServerState>();
  // toolbox for directly registered tools (non-MCP tools)
  #toolbox: Map<string, Tool> = new Map();

  constructor(context: ZypherContext) {
    this.#context = context;
    this.#logger = context.logger.getChild("mcp");
  }

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
    const client = new McpClient(this.#context, server);

    // Create server state
    const state: McpServerState = {
      server,
      client,
      enabled,
    };
    this.#serverStateMap.set(server.id, state);

    // Set enabled state
    state.client.desiredEnabled = enabled;

    this.#logger.info("Registered MCP server {serverId}", {
      serverId: server.id,
    });

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

    this.#logger.info("Unregistered MCP server {serverId}", {
      serverId: id,
    });
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
      this.#logger.info(
        "Re-registering MCP server {serverId} due to config change",
        {
          serverId,
        },
      );
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

    this.#logger.info("Registered tool {toolName}", {
      toolName: tool.name,
    });
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
    this.#logger.debug("=== MCP SERVER MANAGER STATE ===");
    this.#logger.debug("Number of servers: {count}", {
      count: this.#serverStateMap.size,
    });
    this.#logger.debug("Number of directly registered tools: {count}", {
      count: this.#toolbox.size,
    });

    const allTools = this.getAllTools();
    this.#logger.debug("Total number of tools: {count}", {
      count: allTools.size,
    });

    if (this.#toolbox.size > 0) {
      this.#logger.debug("Directly registered tools: {tools}", {
        tools: Array.from(this.#toolbox.keys()).join(", "),
      });
    }

    for (const [serverId, state] of this.#serverStateMap.entries()) {
      this.#logger.debug("Server: {name}", {
        name: state.server.displayName || state.server.id,
      });
      this.#logger.debug("  - ID: {serverId}", { serverId });
      this.#logger.debug("  - Enabled: {enabled}", { enabled: state.enabled });
      this.#logger.debug("  - Connected: {connected}", {
        connected: state.client.connected ?? false,
      });
      this.#logger.debug("  - Tools count: {count}", {
        count: state.client.toolCount ?? 0,
      });

      if (state.client.toolCount > 0) {
        this.#logger.debug("  - Tool names: {tools}", {
          tools: state.client.tools.map((t) => t.name).join(", "),
        });
      }
    }

    this.#logger.debug("All available tools: {tools}", {
      tools: Array.from(allTools.keys()).join(", "),
    });
    this.#logger.debug("=== END STATE ===");
  }
}
