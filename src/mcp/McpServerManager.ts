import type { IMCPServer } from "./McpHost";
import type { Tool } from "../tools";
import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages";

class MCPServerManager {
  private static instance: MCPServerManager;
  private servers = new Map<string, IMCPServer>();
  private toolToServer = new Map<string, IMCPServer>();
  private tools = new Map<string, Tool>();

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public static getInstance(): MCPServerManager {
    if (!MCPServerManager.instance) {
      MCPServerManager.instance = new MCPServerManager();
    }
    return MCPServerManager.instance;
  }

  registerServer(server: IMCPServer, tools: Tool[]) {
    this.servers.set(server.id, server);

    // Map each tool to this server
    for (const tool of tools) {
      this.toolToServer.set(tool.name, server);
    }
  }

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  unregisterServer(serverId: string) {
    const server = this.servers.get(serverId);
    if (!server) return;

    // Remove all tool mappings for this server
    for (const [toolName, mappedServer] of this.toolToServer.entries()) {
      if (mappedServer.id === serverId) {
        this.toolToServer.delete(toolName);
      }
    }

    this.servers.delete(serverId);
  }

  getServerForTool(toolName: string): IMCPServer | undefined {
    return this.toolToServer.get(toolName);
  }

  getAllServers(): IMCPServer[] {
    return Array.from(this.servers.values());
  }

  getServer(serverId: string): IMCPServer | undefined {
    return this.servers.get(serverId);
  }

  clear() {
    this.servers.clear();
    this.toolToServer.clear();
  }
}

export default MCPServerManager;
