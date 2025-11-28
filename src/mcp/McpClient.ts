/**
 * Model Context Protocol (MCP) Client Implementation
 *
 * This file implements a client for the Model Context Protocol, which enables
 * communication between language models (like Claude) and external tools.
 * The client manages:
 * - Connection to MCP servers
 * - Tool discovery and registration
 * - Query processing with tool execution
 * - Message history management
 * - OAuth authentication with MCP servers in server-to-server contexts
 *
 * The implementation uses:
 * - Anthropic's Claude API for LLM interactions
 * - MCP SDK for tool communication
 * - StdioClientTransport for CLI server communication
 * - SSEClientTransport with OAuth for HTTP server communication
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  CallToolResult,
  CompatibilityCallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { assign, createActor, setup, waitFor } from "xstate";
import { createTool, type Tool } from "../tools/mod.ts";
import { jsonToZod } from "./utils.ts";
import type { McpServerEndpoint } from "./mod.ts";
import { formatError, isAbortError } from "../error.ts";
import { assert } from "@std/assert";
import { connectToServer, type OAuthOptions } from "./connect.ts";
import type { ZypherContext } from "../ZypherAgent.ts";
import { from, map, type Observable } from "rxjs";

import { z } from "zod";

export interface McpResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
  annotations?: Record<string, unknown>;
}

export interface McpResourceContent {
  uri?: string;
  name?: string;
  title?: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64
  annotations?: Record<string, unknown>;
}

/** Binary resource content with streaming support */
export interface McpBinaryResourceContent {
  uri?: string;
  name?: string;
  title?: string;
  mimeType?: string;
  data?: Uint8Array;
  stream?: ReadableStream<Uint8Array>;
  size?: number;
  annotations?: Record<string, unknown>;
}

/** Resource reading options */
export interface McpResourceReadOptions {
  uri: string;
  signal?: AbortSignal;
  useCache?: boolean;
  streaming?: boolean;
  maxSize?: number; // Maximum size in bytes for non-streaming reads
}

/** Resource subscription information */
export interface McpResourceSubscription {
  uri: string;
  unsubscribe: () => Promise<void> | void;
}

/** Resource capabilities supported by the server */
export interface McpResourceCapabilities {
  subscribe?: boolean;
  listChanged?: boolean;
}

/**
 * Resource validation error
 * Error codes: https://www.mcpevals.io/blog/mcp-error-codes
 */
export class McpResourceError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly uri?: string,
  ) {
    super(message);
    this.name = "McpResourceError";
  }
}

/** Resource cache entry */
interface ResourceCacheEntry {
  resources: McpResource[];
  content?: McpResourceContent[];
  timestamp: number;
  ttl: number;
}

/** Resource filter options */
export interface McpResourceFilter {
  mimeType?: string;
  minSize?: number;
  maxSize?: number;
  annotations?: Record<string, unknown>;
  namePattern?: string;
  titlePattern?: string;
}

export interface McpResourceTemplate {
  uriTemplate: string;
  name?: string;
  title?: string;
  description?: string;
  mimeType?: string;
  annotations?: Record<string, unknown>;
}

/** Client-specific configuration options */
export interface McpClientOptions {
  /** Optional name of the client for identification */
  name?: string;
  /** Optional version of the client */
  version?: string;
  /** Optional OAuth configuration for authenticated connections */
  oauth?: OAuthOptions;
}

/** Possible state values from the McpClient state machine */
export type McpClientStatus =
  | "disconnected"
  | { connecting: "initializing" | "awaitingOAuth" }
  | { connected: "initial" | "toolDiscovered" }
  | "disconnecting"
  | "disconnectingDueToError"
  | "error"
  | "aborting"
  | "disposed";

// XState machine events - simplified to only result events
type McpClientEvent =
  | { type: "retry" }
  | { type: "aborted" }
  | { type: "disconnected" }
  | { type: "connectionFailed"; error?: Error }
  | { type: "connectionSuccess" }
  | { type: "updateDesiredState"; desiredState: McpClientDesiredState }
  | { type: "toolDiscovered"; tools: Tool[] }
  | { type: "error"; error: Error }
  | { type: "oauthRequired"; authorizationUrl: string };

type McpClientDesiredState = "connected" | "disconnected" | "disposed";

interface McpClientContext {
  desiredState: McpClientDesiredState;
  lastError?: Error;
  /** OAuth authorization URL when awaiting user authorization */
  oauthUrl?: string;
}

/**
 * Wraps an OAuthClientProvider to intercept redirectToAuthorization calls.
 * This allows capturing the authorization URL and updating the state machine
 * without coupling to any specific provider implementation.
 */
function wrapAuthProvider(
  provider: OAuthClientProvider,
  onRedirect: (url: string) => void,
): OAuthClientProvider {
  return {
    get redirectUrl() {
      return provider.redirectUrl;
    },
    get clientMetadata() {
      return provider.clientMetadata;
    },
    clientInformation: provider.clientInformation.bind(provider),
    saveClientInformation: provider.saveClientInformation?.bind(provider),
    tokens: provider.tokens.bind(provider),
    saveTokens: provider.saveTokens.bind(provider),
    codeVerifier: provider.codeVerifier.bind(provider),
    saveCodeVerifier: provider.saveCodeVerifier.bind(provider),
    redirectToAuthorization: async (authorizationUrl: URL) => {
      onRedirect(authorizationUrl.toString());
      await provider.redirectToAuthorization(authorizationUrl);
    },
  };
}

/**
 * MCPClient handles communication with MCP servers and tool execution
 */
export class McpClient {
  readonly #context: ZypherContext;
  readonly #client: Client;
  readonly #serverEndpoint: McpServerEndpoint;
  readonly #oauthOptions?: OAuthOptions;
  readonly #machine;
  readonly #actor;

  #tools: Tool[] = [];
  #connectAbortController: AbortController = new AbortController();
  #transport: Transport | null = null;
  #resourceSubscriptions = new Map<string, McpResourceSubscription>();
  #resourceCache = new Map<string, ResourceCacheEntry>();
  #resourceCapabilities: McpResourceCapabilities = {};
  #resourceListChangeCallbacks = new Set<() => void>();
  #defaultCacheTTL = 5 * 60 * 1000; // 5 min

  /**
   * Creates a new MCPClient instance with separated server and client configuration
   * @param context ZypherAgent execution context
   * @param serverEndpoint Server endpoint information for connection
   * @param clientOptions Client configuration options
   */
  constructor(
    context: ZypherContext,
    serverEndpoint: McpServerEndpoint,
    clientOptions?: McpClientOptions,
  ) {
    this.#context = context;
    this.#client = new Client({
      name: clientOptions?.name ?? "zypher-agent",
      version: clientOptions?.version ?? "1.0.0",
    });
    this.#serverEndpoint = serverEndpoint;
    this.#oauthOptions = clientOptions?.oauth;

    // Create and start the XState machine
    this.#machine = setup({
      types: {} as {
        events: McpClientEvent;
        context: McpClientContext;
      },
      actions: {
        connect: () => this.#connect(),
        abortConnection: () => this.#abortConnection(),
        disconnect: () => this.#disconnect(),
      },
      guards: {
        desiredNotConnected: ({ context }) => {
          return context.desiredState !== "connected";
        },
        desiredDisposed: ({ context }) => {
          return context.desiredState === "disposed";
        },
        desiredConnected: ({ context }) => {
          return context.desiredState === "connected";
        },
      },
    }).createMachine({
      id: "McpClient",
      initial: "disconnected",
      context: {
        desiredState: "disconnected",
        lastError: undefined,
      },
      on: {
        updateDesiredState: {
          actions: assign({
            desiredState: ({ event }) => event.desiredState,
          }),
        },
      },
      states: {
        disconnected: {
          always: [
            {
              target: "disposed",
              guard: { type: "desiredDisposed" },
            },
            {
              target: "connecting",
              guard: { type: "desiredConnected" },
            },
          ],
        },
        connecting: {
          initial: "initializing",
          entry: { type: "connect" },
          on: {
            connectionSuccess: {
              target: "connected",
              actions: assign({ oauthUrl: () => undefined }),
            },
            connectionFailed: {
              target: "error",
              actions: assign({
                lastError: ({ event }) => event.error,
                oauthUrl: () => undefined,
              }),
            },
          },
          always: {
            target: "aborting",
            guard: { type: "desiredNotConnected" },
          },
          states: {
            initializing: {
              on: {
                oauthRequired: {
                  target: "awaitingOAuth",
                  actions: assign({
                    oauthUrl: ({ event }) => event.authorizationUrl,
                  }),
                },
              },
            },
            awaitingOAuth: {},
          },
        },
        connected: {
          initial: "initial",
          on: {
            error: {
              target: "disconnectingDueToError",
              actions: assign({
                lastError: ({ event }) => event.error,
              }),
            },
          },
          always: {
            target: "disconnecting",
            guard: { type: "desiredNotConnected" },
          },
          states: {
            initial: {
              on: {
                toolDiscovered: {
                  target: "toolDiscovered",
                },
              },
            },
            toolDiscovered: {
              type: "final",
            },
          },
        },
        error: {
          on: {
            retry: {
              target: "connecting",
            },
          },
          always: [
            {
              target: "disconnected",
              guard: { type: "desiredNotConnected" },
            },
          ],
        },
        aborting: {
          entry: { type: "abortConnection" },
          on: {
            aborted: {
              target: "disconnected",
            },
          },
        },
        disconnecting: {
          entry: { type: "disconnect" },
          on: {
            disconnected: {
              target: "disconnected",
            },
          },
        },
        disconnectingDueToError: {
          on: {
            disconnected: {
              target: "error",
            },
          },
          entry: {
            type: "disconnect",
          },
        },
        disposed: {
          type: "final",
        },
      },
    });

    this.#actor = createActor(this.#machine);
    this.#actor.start();
  }

  /**
   * Connects to the MCP server and discovers available tools
   * @returns Promise resolving to the list of available tools
   */
  async #connect(): Promise<void> {
    const signal = this.#connectAbortController.signal;

    // Wrap the auth provider to intercept redirectToAuthorization
    let wrappedOAuthOptions: OAuthOptions | undefined;
    if (this.#oauthOptions) {
      const wrappedProvider = wrapAuthProvider(
        this.#oauthOptions.authProvider,
        (url) => {
          this.#actor.send({ type: "oauthRequired", authorizationUrl: url });
        },
      );
      wrappedOAuthOptions = {
        ...this.#oauthOptions,
        authProvider: wrappedProvider,
      };
    }

    try {
      // Connect using appropriate transport
      this.#transport = await connectToServer(
        this.#context.workingDirectory,
        this.#client,
        this.#serverEndpoint,
        { signal, oauth: wrappedOAuthOptions },
      );

      // connectionSuccess clears oauthUrl automatically via state machine action
      this.#actor.send({ type: "connectionSuccess" });
    } catch (error) {
      if (isAbortError(error)) {
        this.#actor.send({ type: "aborted" });
      } else {
        this.#actor.send({
          type: "connectionFailed",
          error: new Error(
            `Failed to connect to MCP server: ${formatError(error)}`,
          ),
        });
      }
    }

    // Once connected, discover tools
    try {
      await this.#discoverTools(signal);
      this.#actor.send({ type: "toolDiscovered", tools: this.#tools });
    } catch (error) {
      this.#actor.send({
        type: "error",
        error: new Error(
          `Failed to discover tools.`,
          {
            cause: error,
          },
        ),
      });
    }
  }

  #abortConnection(): void {
    // abort the current connection
    this.#connectAbortController.abort();
    // then create a new abort controller for the next connection
    this.#connectAbortController = new AbortController();
  }

  /**
   * Cleans up resources and closes connections
   */
  async #disconnect(): Promise<void> {
    if (!this.#transport) {
      throw new Error(
        "Transport should not be null at this state: disconnecting",
      );
    }

    try {
      // Clean up resource subscriptions, resource cache and callbacks
      for (const subscription of this.#resourceSubscriptions.values()) {
        try {
          const result = subscription.unsubscribe();
          if (result instanceof Promise) {
            await result;
          }
        } catch (error) {
          console.warn("Error unsubscribing from resource:", error);
        }
      }

      this.#resourceSubscriptions.clear();
      this.#clearResourceCache();
      this.#resourceListChangeCallbacks.clear();

      await this.#client.close();
    } catch (_) {
      // Ignore errors during close - we're cleaning up anyway
    }
    this.#transport = null;
    this.#tools = [];
    this.#actor.send({ type: "disconnected" });
  }

  /**
   * Disposes of the client and cleans up all resources
   * Should be called when the client is no longer needed
   */
  async dispose(): Promise<void> {
    this.#actor.send({ type: "updateDesiredState", desiredState: "disposed" });

    // wait for the machine to reach the disposed state
    await waitFor(
      this.#actor,
      (snapshot) => snapshot.value === "disposed",
      {
        timeout: 30_000, // 30 seconds (30,000 milliseconds)
      },
    );
  }

  /**
   * Retries the connection after an error.
   * Only valid when status is "error".
   * @throws Error if not in error state
   */
  retry(): void {
    if (this.#actor.getSnapshot().value !== "error") {
      throw new Error("retry() can only be called when status is 'error'");
    }
    this.#actor.send({ type: "retry" });
  }

  /**
   * Waits for the client to complete the full connection sequence
   *
   * This method waits for the entire connection process to complete, including:
   * 1. Establishing connection to the MCP server
   * 2. Discovering and registering available tools (reaches connected.toolDiscovered state)
   *
   * The connection sequence has substates:
   * - connected.initial: Just connected, tool discovery not yet started
   * - connected.toolDiscovered: Full connection complete, tools discovered and ready
   *
   * Note: This method requires desiredEnabled to be set to true first.
   * If desiredEnabled is false, this method will throw immediately rather than wait.
   * If desiredEnabled is changed to false while waiting, the method will throw.
   *
   * @param timeout Optional timeout in milliseconds (default: 10 seconds)
   * @returns Promise that resolves when fully connected (including tool discovery) or rejects on timeout/error
   * @throws Error if desiredEnabled is not true, changes to false during waiting, or connection fails
   */
  async waitForConnection(timeout: number = 10_000): Promise<void> {
    const snapshot = this.#actor.getSnapshot();
    if (snapshot.context.desiredState !== "connected") {
      throw new Error(
        "Cannot wait for connection: desiredEnabled is not set to true",
      );
    }

    // If desiredEnabled is true, the machine can only be in the connecting or connected state
    // If already fully connected (tools discovered), return immediately
    if (snapshot.matches({ connected: "toolDiscovered" })) {
      return;
    }

    // At this point, the machine can be in connecting state or connected.initial state
    assert(
      snapshot.matches("connecting") ||
        snapshot.matches({ connected: "initial" }),
    );

    await waitFor(
      this.#actor,
      (snapshot) =>
        snapshot.matches({ connected: "toolDiscovered" }) ||
        snapshot.value === "error" ||
        snapshot.context.desiredState !== "connected",
      { timeout },
    );

    const finalSnapshot = this.#actor.getSnapshot();

    // Check if desired state changed during waiting
    if (finalSnapshot.context.desiredState !== "connected") {
      throw new Error(
        "Connection attempt cancelled: desiredEnabled was set to false",
      );
    }

    if (finalSnapshot.value === "error") {
      // Get the actual error from context
      const actualError = finalSnapshot.context.lastError;
      throw actualError ??
        new Error("Failed to connect to MCP server, unknown error");
    }
  }

  /**
   * Checks if this client is connected to a server
   * @returns True if connected, false otherwise
   */
  get connected(): boolean {
    const snapshot = this.#actor.getSnapshot();
    return snapshot.context.desiredState === "connected" &&
      snapshot.matches("connected");
  }

  get status(): McpClientStatus {
    return this.#actor.getSnapshot().value;
  }

  /**
   * Observable stream of client status changes
   * Emits the current McpClientStatus whenever the status changes
   * @returns Observable that emits status changes (read-only for consumers)
   */
  get status$(): Observable<McpClientStatus> {
    return from(this.#actor).pipe(map(() => this.status));
  }

  /**
   * Gets the OAuth authorization URL when status is "awaitingOAuth".
   * Returns undefined when not awaiting OAuth authorization.
   */
  get pendingOAuthUrl(): string | undefined {
    return this.#actor.getSnapshot().context.oauthUrl;
  }

  /**
   * Gets the desired enabled state
   * @returns True if desired to be enabled, false otherwise
   */
  get desiredEnabled(): boolean {
    return this.#actor.getSnapshot().context.desiredState === "connected";
  }

  /**
   * Sets the desired enabled state and triggers connection/disconnection
   * @param enabled Whether the client should be enabled
   */
  set desiredEnabled(enabled: boolean) {
    this.#actor.send({
      type: "updateDesiredState",
      desiredState: enabled ? "connected" : "disconnected",
    });
  }

  /**
   * Gets all tools managed by this client
   * @returns Array of tools
   */
  get tools(): Tool[] {
    return [...this.#tools];
  }

  /**
   * Gets the number of tools managed by this client
   * @returns Number of tools
   */
  get toolCount(): number {
    return this.#tools.length;
  }

  /**
   * Discovers and registers tools from the MCP server
   * @private
   */
  async #discoverTools(signal: AbortSignal): Promise<void> {
    const toolResult = await this.#client.listTools({
      signal,
    });

    // Convert MCP tools to our internal tool format
    this.#tools = toolResult.tools.map((tool) => {
      const inputSchema = jsonToZod(tool.inputSchema);
      return createTool({
        name: `${this.#serverEndpoint.id}_${tool.name}`,
        description: tool.description ?? "",
        schema: inputSchema,
        execute: async (params: Record<string, unknown>) => {
          const result = await this.executeToolCall({
            name: tool.name,
            input: params,
          });
          return result;
        },
      });
    });
  }

  /**
   * Gets a specific tool by name
   * @param name The name of the tool to retrieve
   * @returns The tool if found, undefined otherwise
   */
  getTool(name: string): Tool | undefined {
    return this.#tools.find((tool) => tool.name === name);
  }

  /**
   * Executes a tool call and returns the result
   * @param toolCall The tool call to execute
   * @returns The result of the tool execution
   * @throws Error if client is not connected
   */
  async executeToolCall(toolCall: {
    name: string;
    input: Record<string, unknown>;
  }): Promise<CallToolResult> {
    const result = await this.#client.callTool({
      name: toolCall.name,
      arguments: toolCall.input,
    });

    return normalizeToCallToolResult(result);
  }

  /**
   * Lists resources exposed by the connected MCP server.
   */
  async listResources(options?: {
    cursor?: string;
    signal?: AbortSignal;
    filter?: McpResourceFilter;
    useCache?: boolean;
  }): Promise<{ resources: McpResource[]; nextCursor?: string }> {
    try {
      if (options?.useCache !== false) {
        const cacheKey = `list:${options?.cursor ?? "default"}`;
        const cached = this.#resourceCache.get(cacheKey);
        if (cached && this.#isCacheValid(cached)) {
          const filteredResources = options?.filter
            ? cached.resources.filter((resource) =>
              this.#matchesFilter(resource, options.filter!)
            )
            : cached.resources;
          return {
            resources: filteredResources,
            nextCursor: undefined,
          };
        }
      }

      const result = await this.#client.listResources({
        cursor: options?.cursor,
        signal: options?.signal,
        filter: options?.filter,
        useCache: options?.useCache,
      });

      console.log("SDK listResources result:", result);

      const resources =
        (result as { resources: McpResource[]; nextCursor?: string }).resources;

      // Apply filters
      const filteredResources = options?.filter
        ? resources.filter((resource) =>
          this.#matchesFilter(resource, options.filter!)
        )
        : resources;

      // Cache the result
      if (options?.useCache !== false) {
        const cacheKey = `list:${options?.cursor ?? "default"}`;
        this.#resourceCache.set(cacheKey, {
          resources: filteredResources,
          timestamp: Date.now(),
          ttl: this.#defaultCacheTTL,
        });
      }

      return {
        resources: filteredResources,
        nextCursor: (result as { nextCursor?: string }).nextCursor,
      };
    } catch (error) {
      console.error("SDK request error:", error);
      throw this.#normalizeResourceError(error, "resources/list");
    }
  }

  /**
   * Reads the contents of a specific resource by URI.
   */
  async readResource(
    params: McpResourceReadOptions,
  ): Promise<{ contents: McpResourceContent[] }> {
    this.#validateResourceUri(params.uri);

    try {
      if (params.useCache !== false && !params.streaming) {
        const cached = this.#resourceCache.get(params.uri);
        if (cached && cached.content && this.#isCacheValid(cached)) {
          return { contents: cached.content };
        }
      }

      const result = await this.#client.request(
        {
          method: "resources/read",
          params: {
            uri: params.uri,
            streaming: params.streaming,
            maxSize: params.maxSize,
          },
        },
        z.object({
          contents: z.array(z.object({
            uri: z.string().optional(),
            name: z.string().optional(),
            title: z.string().optional(),
            mimeType: z.string().optional(),
            text: z.string().optional(),
            blob: z.string().optional(),
            annotations: z.record(z.unknown()).optional(),
          })),
        }),
      );

      console.log("SDK readResource result:", result);

      const contents = (result as { contents: McpResourceContent[] }).contents;

      if (params.maxSize && contents.length > 0) {
        const totalSize = contents.reduce((size, content) => {
          if (content.text) {
            size += new TextEncoder().encode(content.text).length;
          }
          if (content.blob) size += Math.ceil(content.blob.length * 0.75); // Approximate base64 size
          return size;
        }, 0);

        if (totalSize > params.maxSize) {
          throw new McpResourceError(
            `Resource content exceeds maximum size limit: ${totalSize} > ${params.maxSize}`,
            -32603,
            params.uri,
          );
        }
      }

      // Cache the result
      if (params.useCache !== false && !params.streaming) {
        this.#resourceCache.set(params.uri, {
          resources: [{ uri: params.uri, name: "" }],
          content: contents,
          timestamp: Date.now(),
          ttl: this.#defaultCacheTTL,
        });
      }

      return { contents };
    } catch (error) {
      console.error("SDK readResource error:", error);
      throw this.#normalizeResourceError(error, "resources/read", params.uri);
    }
  }

  /**
   * Reads binary content from a resource with streaming support.
   */
  async readBinaryResource(params: {
    uri: string;
    signal?: AbortSignal;
    streaming?: boolean;
    maxSize?: number;
  }): Promise<{ content: McpBinaryResourceContent }> {
    this.#validateResourceUri(params.uri);

    try {
      if (params.streaming) {
        const result = await this.readResource({
          uri: params.uri,
          signal: params.signal,
          streaming: params.streaming,
          maxSize: params.maxSize,
        });

        // Convert text/blob content to binary
        const binaryContent: McpBinaryResourceContent = {
          uri: params.uri,
          mimeType: result.contents[0]?.mimeType,
          name: result.contents[0]?.name,
          title: result.contents[0]?.title,
          annotations: result.contents[0]?.annotations,
        };

        if (result.contents[0]?.text) {
          binaryContent.data = new TextEncoder().encode(
            result.contents[0].text,
          );
          binaryContent.size = binaryContent.data.length;
        } else if (result.contents[0]?.blob) {
          try {
            const binaryString = atob(result.contents[0].blob);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            binaryContent.data = bytes;
            binaryContent.size = bytes.length;
          } catch (error) {
            throw new McpResourceError(
              `Failed to decode base64 blob: ${
                error instanceof Error ? error.message : String(error)
              }`,
              -32603,
              params.uri,
            );
          }
        }

        return { content: binaryContent };
      }

      // Non-streaming binary
      const result = await this.readResource({
        uri: params.uri,
        signal: params.signal,
        streaming: false,
        maxSize: params.maxSize,
      });

      const content = result.contents[0];
      if (!content) {
        throw new McpResourceError(
          `No content found for resource: ${params.uri}`,
          -32002,
          params.uri,
        );
      }

      const binaryContent: McpBinaryResourceContent = {
        uri: content.uri || params.uri,
        name: content.name,
        title: content.title,
        mimeType: content.mimeType,
        annotations: content.annotations,
      };

      if (content.text) {
        binaryContent.data = new TextEncoder().encode(content.text);
        binaryContent.size = binaryContent.data.length;
      } else if (content.blob) {
        try {
          // Decode base64 blob
          const binaryString = atob(content.blob);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          binaryContent.data = bytes;
          binaryContent.size = bytes.length;
        } catch (error) {
          throw new McpResourceError(
            `Failed to decode base64 blob: ${
              error instanceof Error ? error.message : String(error)
            }`,
            -32603,
            params.uri,
          );
        }
      }

      return { content: binaryContent };
    } catch (error) {
      console.error("SDK readBinaryResource error:", error);
      throw this.#normalizeResourceError(error, "resources/read", params.uri);
    }
  }

  /**
   * Lists resource templates exposed by the server.
   */
  async listResourceTemplates(_options?: {
    signal?: AbortSignal;
  }): Promise<{ resourceTemplates: McpResourceTemplate[] }> {
    try {
      const result = await this.#client.request(
        {
          method: "resources/templates/list",
        },
        z.object({
          resourceTemplates: z.array(z.object({
            uriTemplate: z.string(),
            name: z.string().optional(),
            title: z.string().optional(),
            description: z.string().optional(),
            mimeType: z.string().optional(),
            annotations: z.record(z.unknown()).optional(),
          })),
        }),
      );

      console.log("SDK listResourceTemplates result:", result);
      return result as { resourceTemplates: McpResourceTemplate[] };
    } catch (error) {
      console.error("SDK listResourceTemplates error:", error);
      throw error;
    }
  }

  /**
   * Subscribes to updates for a specific resource. Returns subscription info.
   */
  async subscribeToResource(params: {
    uri: string;
    onUpdated: (update: { uri: string; title?: string }) => void;
    signal?: AbortSignal;
  }): Promise<McpResourceSubscription> {
    this.#validateResourceUri(params.uri);

    if (this.#resourceSubscriptions.has(params.uri)) {
      throw new McpResourceError(
        `Already subscribed to resource: ${params.uri}`,
        -32001,
        params.uri,
      );
    }

    try {
      await this.#client.request({
        method: "resources/subscribe",
        params: { uri: params.uri },
      }, z.object({}));

      const clientWithEvents = this.#client as Client & {
        on?: (event: string, cb: (...args: unknown[]) => void) => void;
        off?: (event: string, cb: (...args: unknown[]) => void) => void;
      };

      const handler = (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const p = payload as {
          method?: string;
          params?: { uri?: string; title?: string };
        };
        if (
          p.method === "notifications/resources/updated" &&
          p.params?.uri === params.uri
        ) {
          // Invalidate cache and notify
          this.#resourceCache.delete(params.uri);
          params.onUpdated({ uri: params.uri, title: p.params.title });
        }
      };

      if (typeof clientWithEvents.on === "function") {
        clientWithEvents.on("notification", handler);
      }

      const unsubscribe = () => {
        if (typeof clientWithEvents.off === "function") {
          clientWithEvents.off("notification", handler);
        }
      };

      const subscription: McpResourceSubscription = {
        uri: params.uri,
        unsubscribe,
      };

      this.#resourceSubscriptions.set(params.uri, subscription);
      return subscription;
    } catch (error) {
      throw this.#normalizeResourceError(
        error,
        "resources/subscribe",
        params.uri,
      );
    }
  }

  /**
   * Unsubscribes from resource updates.
   */
  async unsubscribeFromResource(uri: string): Promise<void> {
    this.#validateResourceUri(uri);

    const subscription = this.#resourceSubscriptions.get(uri);
    if (!subscription) {
      throw new McpResourceError(
        `Not subscribed to resource: ${uri}`,
        -32001,
        uri,
      );
    }

    try {
      const result = subscription.unsubscribe();
      if (result instanceof Promise) {
        await result;
      }

      this.#resourceSubscriptions.delete(uri);

      await this.#client.request({
        method: "resources/unsubscribe",
        params: { uri },
      }, z.object({}));
    } catch (error) {
      throw this.#normalizeResourceError(error, "resources/unsubscribe", uri);
    }
  }

  /**
   * Callback to be notified when the server's resource list changes.
   */
  onResourcesListChanged(callback: () => void): () => void {
    this.#resourceListChangeCallbacks.add(callback);

    const clientWithEvents = this.#client as Client & {
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
      off?: (event: string, cb: (...args: unknown[]) => void) => void;
    };

    const listChangedHandler = () => {
      this.#clearResourceCache();
      callback();
    };

    if (typeof clientWithEvents.on === "function") {
      clientWithEvents.on("resources/listChanged", listChangedHandler);
    }

    const notifHandler = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const p = payload as { method?: string };
      if (p.method === "notifications/resources/list_changed") {
        this.#clearResourceCache();
        callback();
      }
    };

    if (typeof clientWithEvents.on === "function") {
      clientWithEvents.on("notification", notifHandler);
    }

    return () => {
      this.#resourceListChangeCallbacks.delete(callback);

      if (typeof clientWithEvents.off === "function") {
        clientWithEvents.off("resources/listChanged", listChangedHandler);
        clientWithEvents.off("notification", notifHandler);
      }
    };
  }

  /**
   * Gets resource capabilities supported by the server.
   */
  getResourceCapabilities(): McpResourceCapabilities {
    return { ...this.#resourceCapabilities };
  }

  /**
   * Sets resource capabilities
   */
  setResourceCapabilities(capabilities: McpResourceCapabilities): void {
    this.#resourceCapabilities = { ...capabilities };
  }

  /**
   * Clears resource cache.
   */
  clearResourceCache(): void {
    this.#clearResourceCache();
  }

  /**
   * Gets cache statistics.
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.#resourceCache.size,
      entries: Array.from(this.#resourceCache.keys()),
    };
  }

  #validateResourceUri(uri: string): void {
    if (!uri || typeof uri !== "string") {
      throw new McpResourceError(
        "Invalid resource URI: must be a non-empty string",
        -32602,
      );
    }

    try {
      new URL(uri);
    } catch {
      throw new McpResourceError(
        "Invalid resource URI: must be a valid URL",
        -32602,
        uri,
      );
    }
  }

  #normalizeResourceError(error: unknown, method: string, uri?: string): Error {
    if (error instanceof McpResourceError) {
      return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Map common errors to JRPC codes
    if (
      errorMessage.includes("Method not found") ||
      errorMessage.includes("-32601")
    ) {
      return new McpResourceError(
        `Method not supported: ${method}`,
        -32601,
        uri,
      );
    }

    if (errorMessage.includes("not found") || errorMessage.includes("404")) {
      return new McpResourceError(
        `Resource not found: ${uri || "unknown"}`,
        -32002,
        uri,
      );
    }

    if (errorMessage.includes("unauthorized") || errorMessage.includes("403")) {
      return new McpResourceError(
        `Access denied to resource: ${uri || "unknown"}`,
        -32003,
        uri,
      );
    }

    if (errorMessage.includes("timeout")) {
      return new McpResourceError(
        `Request timeout for ${method}`,
        -32004,
        uri,
      );
    }

    return new McpResourceError(
      `Resource operation failed: ${errorMessage}`,
      -32603,
      uri,
    );
  }

  #isCacheValid(entry: ResourceCacheEntry): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  #matchesFilter(resource: McpResource, filter: McpResourceFilter): boolean {
    if (!filter) return true;

    if (filter.mimeType && resource.mimeType !== filter.mimeType) {
      return false;
    }

    if (filter.minSize !== undefined && (resource.size ?? 0) < filter.minSize) {
      return false;
    }

    if (filter.maxSize !== undefined && (resource.size ?? 0) > filter.maxSize) {
      return false;
    }

    if (
      filter.namePattern && !resource.name.match(new RegExp(filter.namePattern))
    ) {
      return false;
    }

    if (
      filter.titlePattern && resource.title &&
      !resource.title.match(new RegExp(filter.titlePattern))
    ) {
      return false;
    }

    if (filter.annotations) {
      for (const [key, value] of Object.entries(filter.annotations)) {
        if (resource.annotations?.[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  #clearResourceCache(): void {
    this.#resourceCache.clear();
  }
}

/**
 * Type guard to check if a result is in legacy format (has toolResult field)
 */
function isLegacyToolResult(
  result: CompatibilityCallToolResult,
): result is { toolResult: unknown } {
  return result != null &&
    typeof result === "object" &&
    "toolResult" in result;
}

/**
 * Type guard to check if a result is in current format (has content field)
 */
function isCurrentToolResult(
  result: CompatibilityCallToolResult,
): result is CallToolResult {
  return result != null &&
    typeof result === "object" &&
    "content" in result &&
    Array.isArray(result.content);
}

/**
 * Normalizes a CompatibilityCallToolResult to CallToolResult using type guards
 */
function normalizeToCallToolResult(
  result: CompatibilityCallToolResult,
): CallToolResult {
  if (isCurrentToolResult(result)) {
    return result;
  }

  if (isLegacyToolResult(result)) {
    return {
      content: [{ type: "text", text: JSON.stringify(result.toolResult) }],
    };
  }

  // Fallback for unexpected formats
  throw new Error(`Unexpected tool result format: ${JSON.stringify(result)}`);
}
