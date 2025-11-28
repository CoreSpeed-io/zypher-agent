import {
  type McpBinaryResourceContent,
  McpClient,
  type McpClientStatus,
  type McpResource,
  type McpResourceContent,
  McpResourceError,
  type McpResourceFilter,
  type McpResourceTemplate,
} from "./McpClient.ts";
import type { Tool } from "../tools/mod.ts";
import type { McpServerEndpoint } from "./mod.ts";
import type { ZypherContext } from "../ZypherAgent.ts";
import type { OAuthOptions } from "./connect.ts";
import McpStoreSDK from "@corespeed/mcp-store-client";
import type { Server } from "@corespeed/mcp-store-client";
import { convertServerDetailToEndpoint } from "./utils.ts";
import { type Observable, Subject, type Subscription } from "rxjs";

/**
 * Metadata about where an MCP server came from
 *
 * - `registry`: Server was registered from the MCP Store registry.
 *   Contains the package identifier (e.g., "@modelcontextprotocol/server-filesystem")
 * - `direct`: Server was registered directly by the user with explicit configuration
 */
export type McpServerSource =
  | { type: "registry"; packageIdentifier: string }
  | { type: "direct" };

/**
 * Represents the internal state of an MCP server including its configuration,
 * client connection, source information, and status subscription.
 */
interface McpServerState {
  /** The server configuration */
  server: McpServerEndpoint;
  /** Metadata about the source of this server */
  source: McpServerSource;
  /** The MCP client instance for this server */
  client: McpClient;
  /** Subscription to client status changes */
  subscription: Subscription;
}

/**
 * Public server info containing the live McpClient instance
 * and readonly snapshots of server configuration and source metadata.
 */
export type McpServerInfo = Omit<McpServerState, "subscription">;

/**
 * Discriminated union of all MCP server manager events
 */
export type McpServerManagerEvent =
  | {
    type: "serverAdded";
    serverId: string;
    server: McpServerEndpoint;
    source: McpServerSource;
  }
  | {
    type: "serverUpdated";
    serverId: string;
    updates: { server?: McpServerEndpoint; enabled?: boolean };
  }
  | {
    type: "serverRemoved";
    serverId: string;
  }
  | {
    type: "clientStatusChanged";
    serverId: string;
    status: McpClientStatus;
    client: McpClient;
  };

/**
 * McpServerManager is a class that manages MCP (Model Context Protocol) servers and their tools.
 * It handles server registration, tool management, and configuration persistence.
 *
 * Authentication is handled by the McpClient layer.
 */
export class McpServerManager {
  // Unified state map containing server config, client, and subscription
  readonly #serverStateMap = new Map<string, McpServerState>();
  // toolbox for directly registered tools (non-MCP tools)
  readonly #toolbox: Map<string, Tool> = new Map();
  // MCP Store client for discovering servers (defaults to CoreSpeed MCP Store)
  readonly #registryClient: McpStoreSDK;
  // Event subject for observable event streaming
  readonly #eventsSubject = new Subject<McpServerManagerEvent>();
  // Flag to track if the manager has been disposed
  #disposed = false;

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
   * Observable stream of all MCP server manager events.
   *
   * Emits events in real-time as:
   * - Servers are added/updated/removed
   * - Client statuses change
   *
   * The observable completes when dispose() is called.
   *
   * @returns Observable that emits discriminated union events
   */
  get events$(): Observable<McpServerManagerEvent> {
    return this.#eventsSubject.asObservable();
  }

  /**
   * Registers a new MCP server and its tools
   * @param server Server configuration (server.id is used as the key)
   * @param enabled Whether the server is enabled
   * @param source Metadata about the source of this server
   * @param oauth Optional OAuth configuration for authenticated connections
   * @returns Promise that resolves when the server is fully connected and ready (if enabled)
   * @throws McpError if server registration fails or server already exists
   */
  async registerServer(
    server: McpServerEndpoint,
    enabled: boolean = true,
    source: McpServerSource = { type: "direct" },
    oauth?: OAuthOptions,
  ): Promise<void> {
    if (this.#disposed) {
      throw new Error("McpServerManager has been disposed");
    }
    if (this.#serverStateMap.has(server.id)) {
      throw new Error(
        `Server ${server.id} already exists`,
      );
    }

    // Create MCP client
    const client = new McpClient(this.context, server, { oauth });

    // Subscribe to client status changes
    const subscription = client.status$.subscribe((status) => {
      this.#eventsSubject.next({
        type: "clientStatusChanged",
        serverId: server.id,
        status,
        client,
      });
    });

    // Create server state with deep copies to prevent external mutation
    const state: McpServerState = {
      server: structuredClone(server),
      source: structuredClone(source),
      client,
      subscription,
    };
    this.#serverStateMap.set(server.id, state);

    // Set enabled state
    client.desiredEnabled = enabled;

    // Emit serverAdded event
    this.#eventsSubject.next({
      type: "serverAdded",
      serverId: server.id,
      server,
      source,
    });

    // Wait for connection to be ready if enabled
    if (enabled) {
      await client.waitForConnection();
    }
  }

  /**
   * All currently registered MCP servers.
   *
   * Returns the McpServerInfo map which contains the live McpClient instance
   * and readonly snapshots of server configuration and source metadata.
   */
  get servers(): ReadonlyMap<string, McpServerInfo> {
    const result = new Map<string, McpServerInfo>();
    for (const [id, state] of this.#serverStateMap) {
      result.set(id, {
        server: structuredClone(state.server),
        source: structuredClone(state.source),
        client: state.client,
      });
    }
    return result;
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
   * @param oauth Optional OAuth configuration for authenticated connections
   * @returns Promise that resolves when the server is fully connected and ready (if enabled)
   * @throws Error if server not found in registry or registration fails
   */
  async registerServerFromRegistry(
    packageIdentifier: string,
    enabled: boolean = true,
    oauth?: OAuthOptions,
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
    await this.registerServer(
      server,
      enabled,
      {
        type: "registry",
        packageIdentifier,
      },
      oauth,
    );
  }

  /**
   * Deregisters a server and removes its tools
   * @param id ID of the server to deregister
   * @throws Error if server is not found or deregistration fails
   */
  async deregisterServer(id: string): Promise<void> {
    if (this.#disposed) {
      throw new Error("McpServerManager has been disposed");
    }
    const state = this.#serverStateMap.get(id);
    if (!state) {
      throw new Error(
        `Server with id ${id} not found`,
      );
    }

    // Dispose the client first (emits final status events)
    await state.client.dispose();

    // Unsubscribe from client status
    state.subscription.unsubscribe();

    // Remove server state
    this.#serverStateMap.delete(id);

    // Emit serverRemoved event
    this.#eventsSubject.next({
      type: "serverRemoved",
      serverId: id,
    });
  }

  /**
   * Updates server configuration and/or enabled status
   * @param serverId The ID of the server
   * @param updates Object containing server config and/or enabled status to update
   * @throws Error if server is not found or update fails
   */
  async updateServer(
    serverId: string,
    updates: {
      server?: McpServerEndpoint;
      enabled?: boolean;
    },
  ): Promise<void> {
    if (this.#disposed) {
      throw new Error("McpServerManager has been disposed");
    }
    const state = this.#serverStateMap.get(serverId);
    if (!state) {
      throw new Error(
        `Server ${serverId} not found`,
      );
    }

    const newEnabled = updates.enabled ?? state.client.desiredEnabled;

    // If config changed, re-register the server
    if (updates.server) {
      await this.deregisterServer(serverId);
      await this.registerServer(updates.server, newEnabled);
      return;
    }

    // Otherwise, just update client's desired enabled state
    state.client.desiredEnabled = newEnabled;

    // Emit serverUpdated event
    this.#eventsSubject.next({
      type: "serverUpdated",
      serverId,
      updates,
    });
  }

  /**
   * Registers a new tool directly (non-MCP tool)
   * @param tool The tool to register
   */
  registerTool(tool: Tool): void {
    if (this.#disposed) {
      throw new Error("McpServerManager has been disposed");
    }
    if (this.#toolbox.has(tool.name)) {
      throw new Error(
        `Tool ${tool.name} already registered`,
      );
    }

    this.#toolbox.set(tool.name, tool);
  }

  /**
   * Disposes the manager by disconnecting all servers and completing the event stream.
   * The manager cannot be reused after calling this method.
   */
  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;

    // Dispose all server clients first (emits final status events)
    await Promise.allSettled(
      Array.from(this.#serverStateMap.values()).map((state) =>
        state.client.dispose()
      ),
    );

    // Unsubscribe from all client status observables
    for (const state of this.#serverStateMap.values()) {
      state.subscription.unsubscribe();
    }
    this.#serverStateMap.clear();
    this.#toolbox.clear();

    // Complete the event stream
    this.#eventsSubject.complete();
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
      if (!state.client.desiredEnabled) continue;

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
    if (!state || !state.client.desiredEnabled) {
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
      if (!state || !state.client.desiredEnabled) {
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
      if (!state.client.desiredEnabled) continue;

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
              signal: params.signal ?? controller.signal,
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
    if (!state || !state.client.desiredEnabled) {
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
      if (!state || !state.client.desiredEnabled) {
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
      if (!state.client.desiredEnabled) continue;

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
      if (state.client.desiredEnabled) {
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
      if (state.client.desiredEnabled) {
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
      if (state.client.desiredEnabled) {
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
      if (!state || !state.client.desiredEnabled) {
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
      if (!state.client.desiredEnabled) continue;

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
