import { z } from "zod";
import { McpClient } from "./McpClient";

export const McpServerConfigSchema = z
  .object({
    url: z.string().url(),
    env: z.record(z.string()),
  })
  .and(z.record(z.unknown()));

export const McpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  client: z.instanceof(McpClient),
  config: McpServerConfigSchema,
});

export type IMcpServer = z.infer<typeof McpServerSchema>;
