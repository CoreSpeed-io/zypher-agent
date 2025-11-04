import { McpError } from "../types/error.ts";
import type { CursorServerConfig } from "../types/cursor.ts";
import type { McpServerEndpoint } from "../mod.ts";

/**
 * Convert McpServerEndpoint back to CursorServerConfig
 * Useful for serializing server config to Cursor format
 */
export function extractConfigFromEndpoint(
  endpoint: McpServerEndpoint,
): CursorServerConfig {
  if (endpoint.type === "command") {
    return {
      command: endpoint.command.command,
      args: endpoint.command.args ?? [],
      ...(endpoint.command.env &&
        Object.keys(endpoint.command.env).length > 0 && {
        env: endpoint.command.env,
      }),
    };
  } else if (endpoint.type === "remote") {
    return {
      url: endpoint.remote.url,
      ...(endpoint.remote.headers &&
        Object.keys(endpoint.remote.headers).length > 0 && {
        headers: endpoint.remote.headers,
      }),
    };
  } else {
    throw new McpError(
      "server_error",
      "Endpoint must be either command or remote type",
    );
  }
}
