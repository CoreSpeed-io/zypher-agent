import { McpServerError } from "../McpServerManager.ts";
import type { ZypherMcpServer } from "../types/local.ts";

export enum ConnectionMode {
  CLI = 1,
  REMOTE = 2,
}

/**
 * Determines the connection mode for a server based on its configuration
 * @param config The server configuration
 * @returns The appropriate connection mode
 */
export function getConnectionMode(config: ZypherMcpServer): ConnectionMode {
  if (config.remotes && config.remotes.length > 0) {
    return ConnectionMode.REMOTE;
  } else if (config.packages && config.packages.length > 0) {
    return ConnectionMode.CLI;
  }
  throw new McpServerError("server_error", "Unknown connection mode");
}
