import { z } from "zod";
import { McpClient } from "./McpClient";

export const McpServerConfigSchema = z
  .object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().url().optional(),
    env: z.record(z.string()).optional(),
  })
  .refine(
    (data) => (data.command && data.args) ?? data.url,
    "Either command and args for CLI mode, or url for SSE mode must be provided",
  );

export const McpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  client: z.instanceof(McpClient),
  config: McpServerConfigSchema,
});

export type IMcpServer = z.infer<typeof McpServerSchema>;
