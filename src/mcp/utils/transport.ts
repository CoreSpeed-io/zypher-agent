import type { Package } from "../types/store.ts";

export enum ConnectionMode {
  CLI = 1,
  REMOTE = 2,
}

/**
 * Determines the connection mode for a server based on its configuration
 * @param config The server configuration
 * @returns The appropriate connection mode
 */
export function getConnectionMode(config: Package): ConnectionMode {
  if (config.name === "unknown") {
    return ConnectionMode.REMOTE;
  }
  return ConnectionMode.CLI;
}
