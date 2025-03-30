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

import { Anthropic } from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * Configuration options for the MCP client
 */
interface IMCPClientConfig {
  /** Optional client name for identification */
  name?: string;
  /** Optional version string */
  version?: string;
}

/**
 * MCPClient class handles communication between Claude and MCP tools
 *
 * This class manages:
 * 1. Connection to MCP servers via stdio transport
 * 2. Tool discovery and registration from servers
 * 3. Query processing with Claude
 * 4. Tool execution and result handling
 * 5. Message history management for conversations
 */
export class MCPClient {
  private client: Client | null = null;
  private anthropic: Anthropic;
  private transport: StdioClientTransport | null = null;
  private _tools: Tool[] = [];
  private config: IMCPClientConfig;

  /**
   * Creates a new MCPClient instance
   * @param config Optional configuration for the client
   * @throws Error if ANTHROPIC_API_KEY is not set in environment
   */
  constructor(
    config: IMCPClientConfig = {
      name: "mcp-client",
      version: "1.0.0",
    },
  ) {
    this.config = config;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    this.anthropic = new Anthropic({
      apiKey,
    });
  }

  /**
   * Returns a copy of the available tools array
   * @returns Array of Tool objects
   */
  get tools(): Tool[] {
    return [...this._tools];
  }

  /**
   * Connects to an MCP server and discovers available tools
   * @param command Command to start the server (e.g., "node", "python")
   * @param args Arguments for the server command
   * @throws Error if connection fails or server is not responsive
   */
  async connectToServer(command: string, args: string[]): Promise<void> {
    try {
      this.transport = new StdioClientTransport({
        command,
        args,
      });

      this.client = new Client(
        {
          name: this.config.name ?? "mcp-client",
          version: this.config.version ?? "1.0.0",
        },
        {
          capabilities: {},
        },
      );

      await this.client.connect(this.transport);

      // List available tools
      const response = await this.client.request(
        { method: "tools/list" },
        ListToolsResultSchema,
      );

      const toolsResponse = response as ListToolsResult;
      this._tools = toolsResponse.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        input_schema: tool.inputSchema,
      }));

      console.log(
        "\nConnected to server with tools:",
        this._tools.map(({ name }) => name),
      );
    } catch (error) {
      console.error("Failed to connect to MCP server:", error);
      throw error;
    }
  }

  /**
   * Processes a query using Claude and executes any requested tool calls
   *
   * This method:
   * 1. Sends the initial query to Claude
   * 2. Processes any tool calls requested by Claude
   * 3. Sends tool results back to Claude for interpretation
   * 4. Continues this loop until no more tool calls are needed
   *
   * @param query The user's query to process
   * @returns Concatenated string of all responses and tool results
   * @throws Error if client is not connected
   */
  async processQuery(query: string, model?: string): Promise<string> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    const finalText: string[] = [];
    let currentResponse = await this.anthropic.messages.create({
      model: model ?? "claude-3-sonnet-20240229",
      max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS ?? "4096"),
      messages,
      tools: this._tools,
    });

    while (true) {
      for (const content of currentResponse.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          const toolName = content.name;
          const toolArgs = content.input;

          const result = await this.client.request(
            {
              method: "tools/call",
              params: {
                name: toolName,
                args: toolArgs,
              },
            },
            CallToolResultSchema,
          );

          finalText.push(
            `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`,
          );

          messages.push({
            role: "assistant",
            content: currentResponse.content,
          });

          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: content.id,
                content: [
                  { type: "text", text: JSON.stringify(result.content) },
                ],
              },
            ],
          });

          currentResponse = await this.anthropic.messages.create({
            model: model ?? "claude-3-sonnet-20240229",
            max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS ?? "4096"),
            messages,
            tools: this._tools,
          });

          if (currentResponse.content[0]?.type === "text") {
            finalText.push(currentResponse.content[0].text);
          }

          continue;
        }
      }

      break;
    }

    return finalText.join("\n");
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
        console.error("Error during cleanup:", error);
      }
    }
  }
}
