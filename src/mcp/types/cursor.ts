import { z } from "zod";
import type { ZypherMcpServer } from "./local.ts";
import { ArgumentType } from "./store.ts";

/**
 * Base configuration interface for Cursor MCP server connections.
 * Contains common settings shared across different connection types.
 */
export interface BaseCursorConfig {
  /** Optional environment variables to pass to the server */
  env?: Record<string, string>;
}

/**
 * CLI-specific configuration interface for local MCP servers.
 * Used when connecting to MCP servers via command line interface.
 */
export interface CursorCliConfig extends BaseCursorConfig {
  /** Command to execute for CLI mode */
  command: string;
  /** Command line arguments */
  args?: string[];
}

/**
 * Remote server configuration interface for external MCP servers.
 * Used when connecting to MCP servers via HTTP/SSE endpoints.
 */
export interface CursorRemoteConfig extends BaseCursorConfig {
  /** Server URL for remote connection (must be a valid URL) */
  url: string;
  /** Optional HTTP headers to send with requests */
  headers?: Record<string, string>;
}

/**
 * Union type representing either CLI or remote server configuration.
 */
export type CursorServerConfig = CursorCliConfig | CursorRemoteConfig;

/**
 * Main Cursor configuration interface defining MCP server connections.
 * Maps server names to their respective configurations.
 */
export interface CursorConfig {
  /** Map of MCP server names to their configurations */
  mcpServers: Record<string, CursorServerConfig>;
}

// Base configuration schema
const $BaseCursorConfigSchema = z.object({
  env: z
    .record(z.string())
    .optional()
    .describe("Optional environment variables to pass to the server"),
});
export const BaseCursorConfigSchema: z.ZodSchema<BaseCursorConfig> =
  $BaseCursorConfigSchema;

// CLI-specific configuration schema
const $CursorCliConfigSchema = $BaseCursorConfigSchema.extend({
  command: z
    .string()
    .min(1, "Command must not be empty")
    .describe("Command to execute for CLI mode"),
  args: z.array(z.string()).default([]).describe("Command line arguments"),
});
export const CursorCliConfigSchema: z.ZodSchema<CursorCliConfig> =
  $CursorCliConfigSchema;

// Remote server configuration schema
const $CursorRemoteConfigSchema = $BaseCursorConfigSchema.extend({
  url: z
    .string()
    .url("Must be a valid URL")
    .describe("Server URL for remote connection"),
  headers: z
    .record(z.string())
    .optional()
    .describe("Optional HTTP headers to send with requests"),
});
export const CursorRemoteConfigSchema: z.ZodSchema<CursorRemoteConfig> =
  $CursorRemoteConfigSchema;

// Union schema for server configuration
const $CursorServerConfigSchema = z.union([
  $CursorCliConfigSchema,
  $CursorRemoteConfigSchema,
]);
export const CursorServerConfigSchema: z.ZodSchema<CursorServerConfig> =
  $CursorServerConfigSchema;

// Main configuration schema
const $CursorConfigSchema = z.object({
  mcpServers: z.record($CursorServerConfigSchema).describe(
    "The MCP servers to connect to",
  ),
});
export const CursorConfigSchema: z.ZodSchema<CursorConfig> =
  $CursorConfigSchema;

export async function parseLocalServers(
  cursorConfig: CursorConfig,
  id?: string,
): Promise<ZypherMcpServer[]> {
  return await Promise.all(
    Object.entries(cursorConfig.mcpServers).map(([name, config]) => {
      // Determine if this is CLI or SSE config
      const isCliConfig = "command" in config;

      const localServer: ZypherMcpServer = {
        _id: id ?? crypto.randomUUID(),
        name,
        description: `user-defined MCP server`,
        packages: isCliConfig
          ? [
            {
              registryName: config.command,
              name: name,
              version: "local-server",
              environmentVariables: config.env
                ? Object.entries(config.env).map(([key, value]) => ({
                  name: key,
                  value: value,
                }))
                : [],
              packageArguments: isCliConfig && config.args
                ? config.args.map((arg) => ({
                  type: ArgumentType.POSITIONAL,
                  name: arg,
                  value: arg,
                }))
                : [],
            },
          ]
          : undefined,
        remotes: isCliConfig ? undefined : [
          {
            url: config.url,
            transportType: "unknown",
          },
        ],
        isEnabled: true,
        isFromMcpStore: false,
      };
      return localServer;
    }),
  );
}
