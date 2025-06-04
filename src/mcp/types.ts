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

// Preprocessed schema that handles nested configurations from registry
// Returns both the extracted config and the extracted name
export const McpServerRegistryConfigSchema = z.preprocess(
  (val) => {
    // If the value is an object with exactly one key, and that key's value
    // contains 'url' or 'command', extract the nested configuration and the key name
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const keys = Object.keys(val);
      if (keys.length === 1) {
        const key = keys[0];
        const nestedValue = (val as Record<string, unknown>)[key];
        if (
          typeof nestedValue === "object" &&
          nestedValue !== null &&
          !Array.isArray(nestedValue) &&
          ("url" in nestedValue || "command" in nestedValue)
        ) {
          return {
            config: nestedValue,
            extractedName: key,
          };
        }
      }
    }
    return {
      config: val,
      extractedName: null,
    };
  },
  z.object({
    config: McpServerConfigSchema,
    extractedName: z.string().nullable(),
  }),
);

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
