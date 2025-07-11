import { z } from "zod";
import {
  PackageSchema,
  RemoteSchema,
  RepositorySchema,
  type ServerDetail,
  VersionDetailSchema,
} from "./store.ts";

// Base server schema
export const ZypherMcpServerSchema = z.object({
  _id: z.string().describe("The unique identifier of the MCP server"),
  name: z.string().describe(
    "The technical name of the MCP server (e.g., io.github.owner/repo)",
  ),
  description: z.string().optional().describe(
    "The description of the MCP server",
  ),
  repository: RepositorySchema.optional().describe(
    "The repository information",
  ),
  iconUrl: z.string().url().optional().describe(
    "The image URL of the MCP server",
  ),
  versionDetail: VersionDetailSchema.optional().describe("The version details"),
  packages: z.array(PackageSchema).optional().describe(
    "The packages of the MCP server",
  ),
  remotes: z.array(RemoteSchema).optional().describe(
    "The remotes of the MCP server",
  ),
  isEnabled: z.boolean().default(true).optional().describe(
    "Whether the MCP server is enabled",
  ),
  isFromMcpStore: z.boolean().optional().describe(
    "Whether the MCP server is from the MCP store",
  ),
  status: z.enum([
    "connected",
    "disconnected",
    "connecting",
    "auth_needed",
    "disabled",
  ]).optional().describe("The status of the MCP server"),
});

export const ZypherMcpServerCreateSchema = ZypherMcpServerSchema.omit({
  _id: true,
});

// Base type from schema
export type ZypherMcpServer = z.infer<typeof ZypherMcpServerSchema>;
export type ZypherMcpServerCreate = z.infer<typeof ZypherMcpServerSchema>;

export function fromServerDetail(serverDetail: ServerDetail): ZypherMcpServer {
  return {
    _id: serverDetail._id,
    name: serverDetail.name,
    description: serverDetail.description,
    repository: serverDetail.repository,
    iconUrl: serverDetail.iconUrl,
    versionDetail: serverDetail.versionDetail,
    packages: serverDetail.packages ?? [],
  };
}
