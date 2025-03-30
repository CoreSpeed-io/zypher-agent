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
import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createTool, type Tool } from "../tools";
import dotenv from "dotenv";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { z } from "zod";

dotenv.config();

/**
 * Configuration options for the MCP client
 */
interface IMcpClientConfig {
  /** Optional client name for identification */
  name?: string;
  /** Optional version string */
  version?: string;
  /** Optional model to use for queries */
  model?: string;
  /** Optional max tokens for model responses */
  maxTokens?: number;
}

/**
 * MCPClient handles communication with MCP servers and tool execution
 */
export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  private _anthropicTools: AnthropicTool[] = [];
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
      model: config.model ?? "claude-3-sonnet-20240229",
      maxTokens:
        config.maxTokens ?? parseInt(process.env.CLAUDE_MAX_TOKENS ?? "4096"),
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
  async retriveTools(url: string): Promise<Tool[]> {
    try {
      if (!this.client) {
        throw new Error("Client is not initialized");
      }
      // deprecated cli transport support for now
      // this.transport = new StdioClientTransport({ command, args });

      // this.client = new Client(
      //   {
      //     name: this.config.name,
      //     version: this.config.version,
      //   },
      //   {
      //     capabilities: {},
      //   },
      // );
      this.transport = new SSEClientTransport(new URL(url));
      await this.client.connect(this.transport);
      const toolResult = await this.client.listTools();

      const tools = toolResult.tools.map((tool) => {
        const inputSchema = z.object(
          tool.inputSchema.properties as Record<string, z.ZodTypeAny>,
        );
        return createTool(
          tool.name,
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
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to connect to MCP server: ${errorMessage}`);
    }
  }

  // /**
  //  * Executes a tool call and returns the result
  //  * @param toolCall The tool call to execute
  //  * @returns The result of the tool execution
  //  * @throws Error if client is not connected
  //  */
  private async executeToolCall(toolCall: {
    name: string;
    input: Record<string, unknown>;
  }) {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    return this.client.request(
      {
        method: "tools/call",
        params: {
          name: toolCall.name,
          args: toolCall.input,
        },
      },
      CallToolResultSchema,
    );
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
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("Error during cleanup:", errorMessage);
      }
    }
  }
}
