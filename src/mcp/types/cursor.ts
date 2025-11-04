import { z } from "zod";
import type { McpServerEndpoint } from "../mod.ts";

export const BaseCursorConfigSchema = z.object({
  env: z
    .record(z.string())
    .optional()
    .describe("Optional environment variables to pass to the server"),
});

// CLI-specific configuration
export const CursorCliConfigSchema = BaseCursorConfigSchema.extend({
  command: z
    .string()
    .min(1, "Command must not be empty")
    .describe("Command to execute for CLI mode"),
  args: z.array(z.string()).default([]).describe("Command line arguments"),
});

// SSE-specific configuration
export const CursorRemoteConfigSchema = BaseCursorConfigSchema.extend({
  url: z
    .string()
    .url("Must be a valid URL")
    .describe("Server URL for SSE mode"),
  headers: z
    .record(z.string())
    .optional()
    .describe("Optional HTTP headers to send with requests"),
});

// Union type for server configuration
export const CursorServerConfigSchema = z.union([
  CursorCliConfigSchema,
  CursorRemoteConfigSchema,
]);

// Updated to match the mcpServers structure from the examples
export const CursorConfigSchema = z.object({
  mcpServers: z.record(CursorServerConfigSchema).describe(
    "The MCP servers to connect to",
  ),
});

export type CursorServerConfig = z.infer<typeof CursorServerConfigSchema>;
export type CursorConfig = z.infer<typeof CursorConfigSchema>;

/**
 * Convert Cursor MCP server config to McpServerEndpoint
 * This is what McpServerManager actually needs
 */
export function parseLocalServers(
  cursorConfig: CursorConfig,
): McpServerEndpoint[] {
  return Object.entries(cursorConfig.mcpServers).map(([name, config]) => {
    // Determine if this is CLI or remote config
    const isCliConfig = "command" in config;

    if (isCliConfig) {
      // CLI/command-based server
      return {
        id: name,
        displayName: name,
        type: "command",
        command: {
          command: config.command,
          args: config.args,
          env: config.env,
        },
      } satisfies McpServerEndpoint;
    } else {
      // Remote server (SSE/HTTP)
      return {
        id: name,
        displayName: name,
        type: "remote",
        remote: {
          url: config.url,
          headers: config.headers,
        },
      } satisfies McpServerEndpoint;
    }
  });
}
