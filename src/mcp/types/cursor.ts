import { z } from "zod";
import type { LocalServer } from "./local.ts";

export const BaseCursorConfigSchema = z.object({
  env: z
    .record(z.string())
    .optional()
    .describe("Optional environment variables to pass to the server"),
  enabled: z.boolean().default(true).describe("Whether this server is enabled"),
});

// CLI-specific configuration
export const CursorServerConfigSchema = BaseCursorConfigSchema.extend({
  url: z
    .string()
    .url("Must be a valid URL")
    .describe("Server URL for SSE mode"),
  headers: z
    .record(z.string())
    .optional()
    .describe("Optional HTTP headers to send with requests"),
  command: z
    .string()
    .min(1, "Command must not be empty")
    .describe("Command to execute for CLI mode"),
  args: z.array(z.string()).default([]).describe("Command line arguments"),
});

// Updated to match the mcpServers structure from the examples
export const CursorConfigSchema = z.object({
  mcpServers: z.record(CursorServerConfigSchema).describe(
    "The MCP servers to connect to",
  ),
});

export type CursorServerConfig = z.infer<typeof CursorServerConfigSchema>;
export type CursorConfig = z.infer<typeof CursorConfigSchema>;

export async function toLocalServer(
  cursorConfig: CursorConfig,
): Promise<LocalServer[]> {
  return await Promise.all(
    Object.entries(cursorConfig.mcpServers).map(([name, config]) => {
      const localServer: LocalServer = {
        _id: crypto.randomUUID(),
        name,
        description: `MCP server for ${name}`,
        packages: [
          {
            registryName: config.url || config.command,
            name: name,
            version: "local-server",
          },
        ],
      };
      return localServer;
    }),
  );
}
