import { z } from "zod";
import { McpClient } from "./McpClient";

const CliConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string()).optional(),
});

const SseConfigSchema = z.object({
  url: z.string().url(),
  env: z.record(z.string()).optional(),
});

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
