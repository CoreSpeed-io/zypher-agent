import { z } from "zod";
import type { LocalServer } from "./local.ts";
import { ArgumentType } from "./store.ts";

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

export async function parseLocalServers(
  cursorConfig: CursorConfig,
): Promise<LocalServer[]> {
  return await Promise.all(
    Object.entries(cursorConfig.mcpServers).map(([name, config]) => {
      // Determine if this is CLI or SSE config
      const isCliConfig = "command" in config;

      const localServer: LocalServer = {
        _id: crypto.randomUUID(),
        name,
        description: `user-defined MCP server`,
        packages: [
          {
            registryName: isCliConfig ? config.command : config.url,
            name: name,
            version: "local-server",
            environmentVariables: config.env
              ? Object.entries(config.env).map(([key, value]) => ({
                name: key,
                value: value,
              }))
              : [],
            packageArguments: isCliConfig
              ? config.args.map((arg) => ({
                type: ArgumentType.POSITIONAL,
                name: arg,
                valueHint: arg,
              }))
              : [],
          },
        ],
      };
      return localServer;
    }),
  );
}
