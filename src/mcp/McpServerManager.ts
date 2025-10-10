import {
  type McpBinaryResourceContent,
  McpClient,
  type McpResource,
  type McpResourceContent,
  McpResourceError,
  type McpResourceFilter,
  type McpResourceTemplate,
} from "./McpClient.ts";
import type { Tool } from "../tools/mod.ts";
import type { McpServerEndpoint } from "./mod.ts";
import type { ZypherContext } from "../ZypherAgent.ts";

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

  constructor(readonly context: ZypherContext) {}

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
    const client = new McpClient(this.context, server);

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

  /**
   * Lists resources from all enabled servers.
   */
  async listAllResources(options?: {
    cursorsByServerId?: Record<string, string | undefined>;
    signal?: AbortSignal;
    filter?: McpResourceFilter;
    useCache?: boolean;
  }): Promise<{
    byServer: Record<string, { resources: McpResource[]; nextCursor?: string }>;
    errors?: Record<string, Error>;
  }> {
    const byServer: Record<
      string,
      { resources: McpResource[]; nextCursor?: string }
    > = {};
    const errors: Record<string, Error> = {};

    for (const [serverId, state] of this.#serverStateMap.entries()) {
      if (!state.enabled) continue;

      try {
        const cursor = options?.cursorsByServerId?.[serverId];
        const { resources, nextCursor } = await state.client.listResources({
          cursor,
          signal: options?.signal,
          filter: options?.filter,
          useCache: options?.useCache,
        });
        byServer[serverId] = { resources, nextCursor };
      } catch (error) {
        console.error(
          `Failed to list resources from server ${serverId}:`,
          error,
        );
        errors[serverId] = error instanceof Error
          ? error
          : new Error(String(error));
      }
    }

    return {
      byServer,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }

  /** Lists resources for a specific server. */
  async listServerResources(serverId: string, options?: {
    cursor?: string;
    signal?: AbortSignal;
    filter?: McpResourceFilter;
    useCache?: boolean;
  }): Promise<{ resources: McpResource[]; nextCursor?: string }> {
    const state = this.#serverStateMap.get(serverId);
    if (!state || !state.enabled) {
      throw new McpResourceError(
        `Server ${serverId} not found or not enabled`,
        -32001,
        serverId,
      );
    }

    try {
      return await state.client.listResources({
        cursor: options?.cursor,
        signal: options?.signal,
        filter: options?.filter,
        useCache: options?.useCache,
      });
    } catch (error) {
      throw new McpResourceError(
        `Failed to list resources from server ${serverId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        -32603,
        serverId,
      );
    }
  }

  /** Reads a resource from the server. */
  async readResource(params: {
    uri: string;
    serverId?: string;
    signal?: AbortSignal;
    useCache?: boolean;
    streaming?: boolean;
    maxSize?: number;
  }): Promise<{ contents: McpResourceContent[]; serverId: string }> {
    if (!params.uri || typeof params.uri !== "string") {
      throw new McpResourceError(
        "Invalid resource URI: must be a non-empty string",
        -32602,
        params.uri,
      );
    }

    if (params.serverId) {
      const state = this.#serverStateMap.get(params.serverId);
      if (!state || !state.enabled) {
        throw new McpResourceError(
          `Server ${params.serverId} not found or not enabled`,
          -32001,
          params.uri,
        );
      }

      try {
        const res = await state.client.readResource({
          uri: params.uri,
          signal: params.signal,
          useCache: params.useCache,
          streaming: params.streaming,
          maxSize: params.maxSize,
        });
        return { contents: res.contents, serverId: params.serverId };
      } catch (error) {
        throw new McpResourceError(
          `Failed to read resource from server ${params.serverId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          -32603,
          params.uri,
        );
      }
    }

    // Do search across servers
    const errorsByServer: Record<string, Error> = {};
    const timeoutMs = 5000;

    const controllers: Record<string, AbortController> = {};
    const tasks: Array<
      Promise<{ contents: McpResourceContent[]; serverId: string }>
    > = [];

    for (const [serverId, state] of this.#serverStateMap.entries()) {
      if (!state.enabled) continue;

      const controller = new AbortController();
      controllers[serverId] = controller;

      const p = (async () => {
        try {
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => {
              controller.abort();
              reject(new Error("Request timeout"));
            }, timeoutMs)
          );

          const res = await Promise.race([
            state.client.readResource({
              uri: params.uri,
              signal: params.signal ? params.signal : controller.signal,
              useCache: params.useCache,
              streaming: params.streaming,
              maxSize: params.maxSize,
            }),
            timeout,
          ]);

          return { contents: res.contents, serverId };
        } catch (err) {
          errorsByServer[serverId] = err instanceof Error
            ? err
            : new Error(String(err));
          throw errorsByServer[serverId];
        }
      })();

      tasks.push(p);
    }

    try {
      const first = await Promise.any(tasks);
      for (const [_sid, c] of Object.entries(controllers)) {
        try {
          c.abort();
        } catch {
          // ignore
        }
      }
      return first;
    } catch {
      const merged = Object.entries(errorsByServer)
        .map(([sid, e]) => `${sid}: ${e.message}`)
        .join("; ");
      throw new McpResourceError(
        `Resource not found across enabled servers: ${params.uri}. Errors: ${merged}`,
        -32002,
        params.uri,
      );
    }
  }

  /** Lists resource templates for a specific server. */
  async listResourceTemplates(
    serverId: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ resourceTemplates: McpResourceTemplate[] }> {
    const state = this.#serverStateMap.get(serverId);
    if (!state || !state.enabled) {
      throw new McpResourceError(
        `Server ${serverId} not found or not enabled`,
        -32001,
        serverId,
      );
    }

    try {
      return await state.client.listResourceTemplates({
        signal: options?.signal,
      });
    } catch (error) {
      throw new McpResourceError(
        `Failed to list resource templates from server ${serverId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        -32603,
        serverId,
      );
    }
  }

  /**
   * Subscribes to resource updates across all servers.
   */
  async subscribeToResource(params: {
    uri: string;
    serverId?: string;
    onUpdated: (
      update: { uri: string; title?: string; serverId: string },
    ) => void;
    signal?: AbortSignal;
  }): Promise<{ unsubscribe: () => Promise<void>; serverId: string }> {
    if (params.serverId) {
      const state = this.#serverStateMap.get(params.serverId);
      if (!state || !state.enabled) {
        throw new McpResourceError(
          `Server ${params.serverId} not found or not enabled`,
          -32001,
          params.uri,
        );
      }

      try {
        const _subscription = await state.client.subscribeToResource({
          uri: params.uri,
          onUpdated: (update) =>
            params.onUpdated({ ...update, serverId: params.serverId! }),
          signal: params.signal,
        });

        return {
          unsubscribe: async () => {
            await state.client.unsubscribeFromResource(params.uri);
          },
          serverId: params.serverId,
        };
      } catch (error) {
        if (error instanceof McpResourceError) {
          throw error;
        }
        throw new McpResourceError(
          `Failed to subscribe to resource on server ${params.serverId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          -32603,
          params.uri,
        );
      }
    }

    // Subscribe on all enabled servers
    const subscriptions: Array<
      { unsubscribe: () => Promise<void>; serverId: string }
    > = [];

    for (const [serverId, state] of this.#serverStateMap.entries()) {
      if (!state.enabled) continue;

      try {
        const _subscription = await state.client.subscribeToResource({
          uri: params.uri,
          onUpdated: (update) => params.onUpdated({ ...update, serverId }),
          signal: params.signal,
        });

        subscriptions.push({
          unsubscribe: async () => {
            await state.client.unsubscribeFromResource(params.uri);
          },
          serverId,
        });
      } catch (error) {
        console.warn(
          `Failed to subscribe to resource ${params.uri} on server ${serverId}:`,
          error,
        );
      }
    }

    if (subscriptions.length === 0) {
      throw new McpResourceError(
        `Failed to subscribe to resource on any enabled server: ${params.uri}`,
        -32002,
        params.uri,
      );
    }

    return {
      unsubscribe: async () => {
        // Unsubscribe from all subscriptions.
        const errors: Error[] = [];
        for (const subscription of subscriptions) {
          try {
            await subscription.unsubscribe();
          } catch (error) {
            errors.push(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        if (errors.length > 0) {
          console.warn("Some unsubscriptions failed:", errors);
        }
      },
      serverId: subscriptions[0]?.serverId ?? "unknown", // Return the first successful server
    };
  }

  /**
   * Callback to be invoked when resource list changes.
   */
  onResourcesListChanged(callback: () => void): () => void {
    const unsubscribers: Array<() => void> = [];

    // Subscribe to all servers
    for (const [serverId, state] of this.#serverStateMap.entries()) {
      if (state.enabled) {
        try {
          const unsubscribe = state.client.onResourcesListChanged(callback);
          unsubscribers.push(unsubscribe);
        } catch (error) {
          console.warn(
            `Failed to register resource list change callback for server ${serverId}:`,
            error,
          );
        }
      }
    }

    return () => {
      // Unsubscribe from all subscriptions.
      for (const unsubscribe of unsubscribers) {
        try {
          unsubscribe();
        } catch (error) {
          console.warn(
            "Error unsubscribing from resource list changes:",
            error,
          );
        }
      }
    };
  }

  /**
   * Clears resource cache for all servers.
   */
  clearAllResourceCaches(): void {
    for (const [serverId, state] of this.#serverStateMap.entries()) {
      if (state.enabled) {
        try {
          state.client.clearResourceCache();
        } catch (error) {
          console.warn(
            `Failed to clear resource cache for server ${serverId}:`,
            error,
          );
        }
      }
    }
  }

  /**
   * Gets resource cache statistics for all servers.
   */
  getAllResourceCacheStats(): Record<
    string,
    { size: number; entries: string[] }
  > {
    const stats: Record<string, { size: number; entries: string[] }> = {};

    for (const [serverId, state] of this.#serverStateMap.entries()) {
      if (state.enabled) {
        try {
          stats[serverId] = state.client.getCacheStats();
        } catch (error) {
          console.warn(
            `Failed to get cache stats for server ${serverId}:`,
            error,
          );
          stats[serverId] = { size: 0, entries: [] };
        }
      }
    }

    return stats;
  }

  /**
   * Gets server state for testing purposes.
   */
  getServerState(serverId: string): McpServerState | undefined {
    return this.#serverStateMap.get(serverId);
  }

  /**
   * Reads binary content from a resource with streaming support.
   */
  async readBinaryResource(params: {
    uri: string;
    serverId?: string;
    signal?: AbortSignal;
    streaming?: boolean;
    maxSize?: number;
  }): Promise<{ content: McpBinaryResourceContent; serverId: string }> {
    // Validate URI
    if (!params.uri || typeof params.uri !== "string") {
      throw new McpResourceError(
        "Invalid resource URI: must be a non-empty string",
        -32602,
        params.uri,
      );
    }

    if (params.serverId) {
      const state = this.#serverStateMap.get(params.serverId);
      if (!state || !state.enabled) {
        throw new McpResourceError(
          `Server ${params.serverId} not found or not enabled`,
          -32001,
          params.uri,
        );
      }

      try {
        const res = await state.client.readBinaryResource({
          uri: params.uri,
          signal: params.signal,
          streaming: params.streaming,
          maxSize: params.maxSize,
        });
        return { content: res.content, serverId: params.serverId };
      } catch (error) {
        throw new McpResourceError(
          `Failed to read binary resource from server ${params.serverId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          -32603,
          params.uri,
        );
      }
    }

    // Search across all enabled servers
    const errors: Error[] = [];
    const timeoutMs = 10000; // 10 second timeout for binary reads

    for (const [serverId, state] of this.#serverStateMap.entries()) {
      if (!state.enabled) continue;

      try {
        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Request timeout")), timeoutMs);
        });

        // Race between the actual request and timeout
        const res = await Promise.race([
          state.client.readBinaryResource({
            uri: params.uri,
            signal: params.signal,
            streaming: params.streaming,
            maxSize: params.maxSize,
          }),
          timeoutPromise,
        ]);

        return { content: res.content, serverId };
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        console.warn(
          `Failed to read binary resource ${params.uri} from server ${serverId}:`,
          errorMessage,
        );
        errors.push(error instanceof Error ? error : new Error(errorMessage));
        // Continue to next server
      }
    }

    // If we get here, the resource wasn't found on any server
    const errorMessages = errors.map((e) => e.message).join("; ");
    throw new McpResourceError(
      `Binary resource not found across enabled servers: ${params.uri}. Errors: ${errorMessages}`,
      -32002,
      params.uri,
    );
  }
}
