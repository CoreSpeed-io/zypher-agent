import { z } from "zod";
import { McpClient } from "./McpClient.ts";

// Common configuration fields shared between CLI and SSE modes
const BaseConfigSchema = z.object({
  env: z
    .record(z.string())
    .optional()
    .describe("Optional environment variables to pass to the server"),
  enabled: z.boolean().default(true).describe("Whether this server is enabled"),
});

// CLI-specific configuration
const CliConfigSchema = BaseConfigSchema.extend({
  command: z
    .string()
    .min(1, "Command must not be empty")
    .describe("Command to execute for CLI mode"),
  args: z.array(z.string()).default([]).describe("Command line arguments"),
});

// SSE-specific configuration
const SseConfigSchema = BaseConfigSchema.extend({
  url: z
    .string()
    .url("Must be a valid URL")
    .describe("Server URL for SSE mode"),
});

// Union type for server configuration
export const McpServerConfigSchema = z.union([
  CliConfigSchema,
  SseConfigSchema,
]);

export type IMcpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const McpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  client: z.instanceof(McpClient),
  config: McpServerConfigSchema,
  enabled: z.boolean().default(true),
});

export type IMcpServer = z.infer<typeof McpServerSchema>;

export const McpServerApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  tools: z.array(z.string()),
});

export type IMcpServerApi = z.infer<typeof McpServerApiSchema>;

export const McpServerIdSchema = z.string().min(1).describe("MCP server ID");
