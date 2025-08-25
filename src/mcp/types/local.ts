import { z } from "zod";
import {
  type Argument,
  type Input,
  type KeyValueInput,
  PackageSchema,
  RemoteSchema,
  RepositorySchema,
  type ServerDetail,
  VersionDetailSchema,
} from "./store.ts";

/**
 * Type definition for ZypherMcpServer representing an MCP (Model Context Protocol) server configuration.
 *
 * This type defines the structure for MCP servers managed by the Zypher Agent,
 * including connection details, authentication status, and package/remote configurations.
 */
export interface ZypherMcpServer {
  /** Unique identifier for the MCP server */
  _id: string;

  /** Technical name of the MCP server (e.g., io.github.owner/repo) */
  name: string;

  /** Human-readable description of the MCP server's functionality */
  description?: string;

  /** Repository information where the MCP server is hosted */
  repository?: {
    /** Repository URL (must be a valid URL) */
    url: string;
    /** Source platform (github, gitlab, etc.) */
    source: string;
    /** Repository ID on the platform */
    id: string;
  };

  /** URL to the server's icon image */
  iconUrl?: string;

  /** Version information for the MCP server */
  versionDetail?: {
    /** Semantic version string */
    version: string;
    /** Release date in ISO 8601 format */
    releaseDate: string;
    /** Whether this is the latest available version */
    isLatest: boolean;
  };

  /** Package configurations for local MCP servers */
  packages?: Array<{
    /** Registry/provider name of the MCP server */
    registryName: string;
    /** Package name */
    name: string;
    /** Package version */
    version: string;
    /** Optional runtime hint for execution */
    runtimeHint?: string;
    /** Runtime arguments for server execution */
    runtimeArguments?: Array<Argument>;
    /** Package-specific arguments */
    packageArguments?: Array<Argument>;
    /** Environment variables for the server */
    environmentVariables?: Array<KeyValueInput>;
  }>;

  /** Remote connection configurations for external MCP servers */
  remotes?: Array<{
    /** Transport protocol type (SSE, HTTP, WebSocket, etc.) */
    transportType: string;
    /** Connection URL for the remote server */
    url: string;
    /** Custom headers for the connection */
    headers?: Array<Input>;
  }>;

  /** Whether the MCP server is currently enabled (defaults to true) */
  isEnabled?: boolean;

  /** Whether the server configuration originated from the MCP store */
  isFromMcpStore?: boolean;

  /** Current connection status of the MCP server */
  status?:
    | "connected"
    | "disconnected"
    | "connecting"
    | "auth_needed"
    | "disabled";
}

// Base server schema
const $ZypherMcpServerSchema = z.object({
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
export const ZypherMcpServerSchema: z.ZodSchema<ZypherMcpServer> =
  $ZypherMcpServerSchema;

export interface ZypherMcpServerCreate extends Omit<ZypherMcpServer, "_id"> {}

export const ZypherMcpServerCreateSchema: z.ZodSchema<ZypherMcpServerCreate> =
  $ZypherMcpServerSchema.omit({
    _id: true,
  });

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
