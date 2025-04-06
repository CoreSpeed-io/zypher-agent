import type { McpServerManager } from "./McpServerManager";
import type {
  IMcpServerApi,
  IMcpServerConfig,
  IMcpServerPublicConfig,
} from "./types";
import type { Tool } from "../tools";

class McpServerController {
  constructor(private readonly mcpServerManager: McpServerManager) {}

  getServersWithTools(): IMcpServerApi[] {
    return this.mcpServerManager.getAllServerWithTools();
  }

  async setServerStatus(serverId: string, enabled: boolean): Promise<void> {
    await this.mcpServerManager.setServerStatus(serverId, enabled);
  }

  getServerStatus(serverId: string): boolean {
    return this.mcpServerManager.getServerStatus(serverId);
  }

  async registerServer(
    serverId: string,
    config: IMcpServerConfig,
  ): Promise<void> {
    await this.mcpServerManager.registerServer(serverId, config);
  }

  async deregisterServer(serverId: string): Promise<void> {
    await this.mcpServerManager.deregisterServer(serverId);
  }

  async updateServerConfig(
    serverId: string,
    config: IMcpServerConfig,
  ): Promise<void> {
    await this.mcpServerManager.updateServerConfig(serverId, config);
  }

  getServerConfig(serverId: string): IMcpServerPublicConfig {
    const config = this.mcpServerManager.getServerConfig(serverId);
    if (!config) {
      throw new Error(`Server config not found for server ID: ${serverId}`);
    }
    return config;
  }

  getAvailableTools(): string[] {
    return Array.from(this.mcpServerManager.getAllTools().keys());
  }

  registerTool(tool: Tool): void {
    this.mcpServerManager.registerTool(tool);
  }

  async reloadConfig(): Promise<void> {
    await this.mcpServerManager.reloadConfig();
  }
}
export default McpServerController;
