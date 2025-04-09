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
 *
 * The implementation uses:
 * - Anthropic's Claude API for LLM interactions
 * - MCP SDK for tool communication
 * - StdioClientTransport for server communication
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createTool, type Tool } from "../tools/index.ts";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { z } from "zod";
import type { IMcpServerConfig } from "./types.ts";

/**
 * Configuration options for the MCP client
 */
export interface IMcpClientConfig {
  /** Optional client name for identification */
  name?: string;
  /** Optional version string */
  version?: string;
  /** Optional server name */
  serverName?: string;
}

export enum ConnectionMode {
  CLI = 1,
  SSE = 2,
}

/**
 * MCPClient handles communication with MCP servers and tool execution
 */
export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  private config: Required<IMcpClientConfig>;

  /**
   * Creates a new MCPClient instance
   * @param config Optional configuration for the client
   * @throws Error if ANTHROPIC_API_KEY is not set in environment
   */
  constructor(config: IMcpClientConfig = {}) {
    this.config = {
      name: config.name ?? "mcp-client",
      version: config.version ?? "1.0.0",
      serverName: config.serverName ?? "default-server",
    };

    this.client = new Client(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {},
    );
  }

  /**
   * Connects to an MCP server and discovers available tools
   * @param command Command to start the server
   * @param args Arguments for the server command
   * @throws Error if connection fails or server is not responsive
   */
  async retriveTools(
    config: IMcpServerConfig,
    mode: ConnectionMode = ConnectionMode.CLI,
  ): Promise<Tool[]> {
    try {
      if (!this.client) {
        throw new Error("Client is not initialized");
      }

      this.transport = this.buildTransport(mode, config);
      await this.client.connect(this.transport);
      const toolResult = await this.client.listTools();

      const tools = toolResult.tools.map((tool) => {
        const inputSchema = jsonToZod(tool.inputSchema);
        return createTool(
          `mcp_${this.config.serverName}_${tool.name}`,
          tool.description ?? "",
          inputSchema,
          async (params: Record<string, unknown>) => {
            const result = await this.executeToolCall({
              name: tool.name,
              input: params,
            });
            return JSON.stringify(result);
          },
        );
      });

      return tools;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Unknown error";
      throw new Error(`Failed to connect to MCP server: ${errorMessage}`);
    }
  }

  /**
   * Executes a tool call and returns the result
   * @param toolCall The tool call to execute
   * @returns The result of the tool execution
   * @throws Error if client is not connected
   */
  private async executeToolCall(toolCall: {
    name: string;
    input: Record<string, unknown>;
  }) {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    const result = await this.client.callTool({
      name: toolCall.name,
      arguments: toolCall.input,
    });
    return result;
  }

  /**
   * Cleans up resources and closes connections
   * Should be called when the client is no longer needed
   */
  async cleanup(): Promise<void> {
    if (this.transport) {
      try {
        await this.client?.close();
        this.transport = null;
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : "Unknown error";
        console.error("Error during cleanup:", errorMessage);
      }
    }
  }

  private buildTransport(mode: ConnectionMode, config: IMcpServerConfig) {
    switch (mode) {
      case ConnectionMode.CLI: {
        if (!("command" in config)) {
          throw new Error("CLI mode requires command and args");
        }

        // Default values for common environment variables
        const defaultEnvVars: Record<string, string> = {
          PATH: "/usr/local/bin:/usr/bin:/bin",
          HOME: Deno.env.get("HOME") || "/home",
          PWD: Deno.cwd(),
          SHELL: "/bin/sh",
          LANG: "en_US.UTF-8",
          TERM: "xterm-256color",
        };

        // Get environment variables with fallbacks to defaults
        const filteredEnvVars = Object.fromEntries(
          Object.entries(defaultEnvVars).map(([key, defaultValue]) => [
            key,
            Deno.env.get(key) || defaultValue
          ])
        );

        return new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: {
            ...filteredEnvVars,
            ...config.env,
          } as Record<string, string>,
        });
      }

      case ConnectionMode.SSE: {
        if (!("url" in config)) {
          throw new Error("SSE mode requires a URL");
        }
        return new SSEClientTransport(new URL(config.url));
      }

      default:
        throw new Error(`Unsupported connection mode: ${mode as string}`);
    }
  }
}

function jsonToZod(inputSchema: {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
}) {
  const properties = inputSchema.properties ?? {};
  const required = inputSchema.required ?? [];

  const schemaProperties = Object.entries(properties).reduce(
    (acc: Record<string, z.ZodTypeAny>, [key, value]) => {
      const property = value as { type: string; description?: string };
      const zodType = createZodType(property);
      acc[key] = required.includes(key) ? zodType : zodType.optional();
      return acc;
    },
    {} as Record<string, z.ZodTypeAny>,
  );

  return z.object(schemaProperties);
}

function createZodType(property: {
  type: string;
  description?: string;
}): z.ZodTypeAny {
  const typeMap: Record<string, () => z.ZodTypeAny> = {
    string: () => z.string(),
    number: () => z.number(),
    boolean: () => z.boolean(),
    array: () => z.array(z.any()),
    object: () => z.record(z.any()),
  };

  const zodType = typeMap[property.type]?.() ?? z.any();
  return property.description
    ? zodType.describe(property.description)
    : zodType;
}
