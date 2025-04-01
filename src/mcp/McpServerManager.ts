import { ConnectionMode, McpClient } from "./McpClient";
import fs from "fs/promises";
import type { Tool } from "../tools";
import { z } from "zod";
import {
  McpServerSchema,
  type IMcpServer,
  McpServerConfigSchema,
} from "./types";

const McpConfigSchema = z.object({
  mcpServers: z.record(McpServerConfigSchema),
});

type IMcpConfig = z.infer<typeof McpConfigSchema>;

export class McpServerManager {
  private static instance: McpServerManager;
  private _config: IMcpConfig | null = null;
  private _servers = new Map<string, IMcpServer>();
  private _tools = new Map<string, Tool>();
  private _initialized = false;

  private constructor() {
    // console.debug("Initializing McpServerManager singleton");
  }

  public static getInstance(): McpServerManager {
    if (!McpServerManager.instance) {
      McpServerManager.instance = new McpServerManager();
    }
    return McpServerManager.instance;
  }

  async init() {
    if (this._initialized) {
      // console.debug(
      //   "McpServerManager already initialized, skipping initialization",
      // );
      return this;
    }

    // console.debug("Starting McpServerManager initialization");

    // 1. Read and parse server configs from mcp.json
    await this.loadConfig();

    // 2. Initialize servers and fetch their tools
    await this.initializeServers();

    // console.debug("McpServerManager initialization complete");
    // console.debug("Registered servers:", Array.from(this._servers.keys()));
    // console.debug("Available tools:", Array.from(this._tools.keys()));

    this._initialized = true;
    return this;
  }

  getTools(): Tool[] {
    const tools = Array.from(this._tools.values());
    // console.debug(`Getting all tools: found ${tools.length} tools`);
    return tools;
  }

  public getTool(name: string): Tool | undefined {
    const tool = this._tools.get(name);
    // console.debug(`Getting tool ${name}: ${tool ? "found" : "not found"}`);
    return tool;
  }

  private async loadConfig(configPath = "mcp.json"): Promise<void> {
    // console.debug(`Loading config from ${configPath}`);
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      const parsedConfig = JSON.parse(configContent) as Record<string, unknown>;
      this._config = McpConfigSchema.parse(parsedConfig);
      // console.debug(
      //   `Loaded config with ${Object.keys(this._config.mcpServers).length} servers`,
      // );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to load config: ${errorMessage}`);
      throw new Error(`Failed to load MCP config: ${errorMessage}`);
    }
  }

  private async initializeServers(): Promise<void> {
    if (!this._config) {
      throw new Error("Config not loaded. Call loadConfig() first.");
    }

    // console.debug("Starting server initialization");

    // First create all server instances
    for (const [id, serverConfig] of Object.entries(this._config.mcpServers)) {
      const server = McpServerSchema.parse({
        id,
        name: id,
        client: new McpClient({ serverName: id }),
        config: serverConfig,
      });
      this._servers.set(id, server);
      // console.debug(`Created server instance for ${id}`);
    }

    // Then fetch and register tools for all servers
    const serverInitPromises = Array.from(this._servers.entries()).map(
      async ([id, server]) => {
        try {
          const connectionMode = this.getConnectionMode(server.config);
          const tools = await server.client.retriveTools(
            server.config,
            connectionMode,
          );
          // Register each tool
          for (const tool of tools) {
            if (this._tools.has(tool.name)) {
              console.warn(
                `Tool ${tool.name} already registered, skipping registration`,
              );
              continue;
            }
            // console.debug(`Registering tool ${tool.name} from server ${id}`);
            this._tools.set(tool.name, tool);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`Failed to initialize server ${id}: ${errorMessage}`);
          // Remove the failed server
          this._servers.delete(id);
        }
      },
    );

    await Promise.all(serverInitPromises);
  }

  async cleanup(): Promise<void> {
    // Cleanup all server clients
    for (const server of this._servers.values()) {
      try {
        await server.client.cleanup();
      } catch (error) {
        console.error(`Error cleaning up server ${server.id}:`, error);
      }
    }

    this._servers.clear();
    this._tools.clear();
    this._initialized = false;
    // console.debug("Completed cleanup");
  }

  private getConnectionMode(config: IMcpServer["config"]): ConnectionMode {
    if (config.url) {
      return ConnectionMode.SSE;
    }
    return ConnectionMode.CLI;
  }
}
