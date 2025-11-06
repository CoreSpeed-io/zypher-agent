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
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  CallToolResult,
  CompatibilityCallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { assign, createActor, setup, waitFor } from "xstate";
import { createTool, type Tool } from "../tools.ts";
import { jsonToZod } from "./utils.ts";
import type { McpServerEndpoint } from "./mod.ts";
import { formatError, isAbortError } from "../error.ts";
import { assert } from "@std/assert";
import { connectToServer } from "./connect.ts";
import type { ZypherContext } from "../ZypherAgent.ts";

/** Client-specific configuration options */
export interface McpClientOptions {
  /** Optional name of the client for identification */
  name?: string;
  /** Optional version of the client */
  version?: string;
}

type McpClientStatus =
  | "disconnected" // Not connected, not trying to connect
  | "connecting" // In process of connecting
  | "connected" // Successfully connected
  | "disconnecting" // In process of disconnecting
  | "disconnectingDueToError" // Disconnecting due to an error
  | "error" // Connection failed, can retry
  | "aborting" // Aborting connection attempt
  | "disposed"; // Being disposed (final state)

// XState machine events - simplified to only result events
type McpClientEvent =
  | { type: "retry" }
  | { type: "aborted" }
  | { type: "disconnected" }
  | { type: "connectionFailed"; error?: Error }
  | { type: "connectionSuccess" }
  | { type: "updateDesiredState"; desiredState: McpClientDesiredState }
  | { type: "toolDiscovered"; tools: Tool[] }
  | { type: "error"; error: Error };

type McpClientDesiredState = "connected" | "disconnected" | "disposed";

interface McpClientContext {
  desiredState: McpClientDesiredState;
  lastError?: Error;
}

/**
 * MCPClient handles communication with MCP servers and tool execution
 */
export class McpClient {
  readonly #context: ZypherContext;
  readonly #client: Client;
  readonly #serverEndpoint: McpServerEndpoint;
  readonly #machine;
  readonly #actor;

  #tools: Tool[] = [];
  #connectAbortController: AbortController = new AbortController();
  #transport: Transport | null = null;

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
          entry: { type: "connect" },
          on: {
            connectionSuccess: {
              target: "connected",
            },
            connectionFailed: {
              target: "error",
              actions: assign({
                lastError: ({ event }) => event.error,
              }),
            },
          },
          always: {
            target: "aborting",
            guard: { type: "desiredNotConnected" },
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

    try {
      // Connect using appropriate transport
      this.#transport = await connectToServer(
        this.#context.workingDirectory,
        this.#client,
        this.#serverEndpoint,
        { signal },
      );

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
      snapshot.value === "connecting" ||
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
    const snapshot = this.#actor.getSnapshot();

    // Use XState's matches method for type-safe state checking
    if (snapshot.matches("disconnected")) return "disconnected";
    if (snapshot.matches("connecting")) return "connecting";
    if (snapshot.matches("connected")) return "connected";
    if (snapshot.matches("disconnecting")) return "disconnecting";
    if (snapshot.matches("disconnectingDueToError")) {
      return "disconnectingDueToError";
    }
    if (snapshot.matches("error")) return "error";
    if (snapshot.matches("aborting")) return "aborting";
    if (snapshot.matches("disposed")) return "disposed";

    // This should never happen if our state machine is properly defined
    throw new Error(`Unknown state: ${JSON.stringify(snapshot.value)}`);
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
