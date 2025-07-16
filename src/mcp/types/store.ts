/**
 * Complete Schema definitions for MCP (Model Context Protocol) Store
 * Based on Go schema with camelCase naming convention
 */
import { z } from "zod";

// ==================== Enum Definitions ====================

export enum AuthMethod {
  GITHUB = "github",
  NONE = "none",
}

export enum Format {
  STRING = "string",
  NUMBER = "number",
  BOOLEAN = "boolean",
  FILE_PATH = "file_path",
}

export enum ArgumentType {
  POSITIONAL = "positional",
  NAMED = "named",
}

// ==================== Zod Enum Schemas ====================

export const AuthMethodSchema = z.nativeEnum(AuthMethod);
export const FormatSchema = z.nativeEnum(Format);
export const ArgumentTypeSchema = z.nativeEnum(ArgumentType);

// ==================== Recursive Type System ====================

// Forward declare types for recursive references
export type Input = {
  description?: string;
  isRequired?: boolean;
  format?: Format;
  value?: string;
  isSecret?: boolean;
  default?: string;
  choices?: string[];
  template?: string;
  properties?: Record<string, Input>;
};

export type InputWithVariables = Input & {
  variables?: Record<string, Input>;
};

export type KeyValueInput = InputWithVariables & {
  name: string;
};

export type Argument = InputWithVariables & {
  type: ArgumentType;
  name?: string;
  isRepeated?: boolean;
  valueHint?: string;
};

// Define base input shape (without recursion)
const BaseInputShape = {
  description: z.string().optional().describe("The description of the input"),
  isRequired: z.boolean().optional().default(false).describe(
    "Whether the input is required",
  ),
  format: FormatSchema.optional().default(Format.STRING).describe(
    "The format of the input",
  ),
  value: z.string().optional().describe("The value of the input"),
  isSecret: z.boolean().optional().default(false).describe(
    "Whether the input is a secret",
  ),
  default: z.string().optional().describe("The default value of the input"),
  choices: z.array(z.string()).optional().describe("The choices of the input"),
  template: z.string().optional().describe("The template of the input"),
};

// Base input schema with recursive properties support
export const InputSchema: z.ZodType<Input> = z.lazy(() =>
  z.object({
    ...BaseInputShape,
    properties: z.record(InputSchema).optional().describe(
      "Nested properties of the input",
    ),
  })
);

// Input with variables schema
export const InputWithVariablesSchema: z.ZodType<InputWithVariables> = z.lazy(
  () =>
    z.intersection(
      InputSchema,
      z.object({
        variables: z.record(InputSchema).optional().describe(
          "The variables of the input",
        ),
      }),
    ),
);

// Key-value input schema
export const KeyValueInputSchema: z.ZodType<KeyValueInput> = z.lazy(() =>
  z.intersection(
    InputWithVariablesSchema,
    z.object({
      name: z.string().describe("The name/key of the input"),
    }),
  )
);

// Argument schema
export const ArgumentSchema: z.ZodType<Argument> = z.lazy(() =>
  z.intersection(
    InputWithVariablesSchema,
    z.object({
      type: ArgumentTypeSchema.describe(
        "The type of the argument (positional or named)",
      ),
      name: z.string().optional().describe("The name of the argument"),
      isRepeated: z.boolean().optional().describe(
        "Whether the argument can be repeated",
      ),
      valueHint: z.string().optional().describe("Hint for the argument value"),
    }),
  )
);

// ==================== Core Entity Schemas ====================

// Authentication information schema
export const AuthenticationSchema = z.object({
  method: AuthMethodSchema.optional().describe("The authentication method"),
  token: z.string().optional().describe("The authentication token"),
  repoRef: z.string().optional().describe(
    "The repository reference for authentication",
  ),
});

// Repository information schema
export const RepositorySchema = z.object({
  url: z.string().url().describe("The repository URL"),
  source: z.string().describe("The source platform (github, gitlab, etc.)"),
  id: z.string().describe("The repository ID on the platform"),
});

// Version details schema
export const VersionDetailSchema = z.object({
  version: z.string().describe("The version of the MCP server"),
  releaseDate: z.string().describe(
    "The release date of the MCP server (ISO 8601)",
  ),
  isLatest: z.boolean().describe("Whether this is the latest version"),
});

// Package configuration schema
export const PackageSchema = z.object({
  registryName: z.string().describe(
    "The registry/provider name of the MCP server",
  ),
  name: z.string().describe("The name of the MCP server package"),
  version: z.string().describe("The version of the MCP server"),
  runtimeHint: z.string().optional().describe(
    "The runtime hint of the MCP server",
  ),
  runtimeArguments: z.array(ArgumentSchema).optional().describe(
    "The runtime arguments of the MCP server",
  ),
  packageArguments: z.array(ArgumentSchema).optional().describe(
    "The package arguments of the MCP server",
  ),
  environmentVariables: z.array(KeyValueInputSchema).optional().describe(
    "Environment variables for the server",
  ),
});

// Remote connection schema
export const RemoteSchema = z.object({
  transportType: z.string().describe(
    "The transport type of the MCP server (SSE, HTTP, etc.)",
  ),
  url: z.string().url().describe("The URL of the MCP server"),
  headers: z.array(InputSchema).optional().describe(
    "Custom headers for the connection",
  ),
});

// Base server schema
export const ServerSchema = z.object({
  _id: z.string().describe("The unique identifier of the MCP server"),
  name: z.string().describe(
    "The technical name of the MCP server (e.g., io.github.owner/repo)",
  ),
  description: z.string().describe("The description of the MCP server"),
  repository: RepositorySchema.describe("The repository information"),
  iconUrl: z.string().url().optional().describe(
    "The image URL of the MCP server",
  ),
  versionDetail: VersionDetailSchema.describe("The version details"),
});

// Detailed server schema - extends base server
export const ServerDetailSchema = ServerSchema.extend({
  packages: z.array(PackageSchema).optional().describe(
    "The packages of the MCP server",
  ),
  remotes: z.array(RemoteSchema).optional().describe(
    "The remote connections of the MCP server",
  ),
});

export const ServerCreateSchema = ServerSchema.omit({
  _id: true,
});

// Server list schema
export const ServerListSchema = z.object({
  servers: z.array(ServerSchema).describe("The list of servers"),
  next: z.string().optional().describe("The cursor for the next page"),
  totalCount: z.number().describe("The total count of servers"),
});

// Publish request schema - extends detailed server, adds auth field
export const PublishRequestSchema = ServerDetailSchema.extend({
  authStatusToken: z.string().optional().describe(
    "Internal authentication status token (not serialized)",
  ),
});

// ==================== API Related Schemas ====================

// Pagination metadata schema
export const MetadataSchema = z.object({
  nextCursor: z.string().optional().describe("The cursor for the next page"),
  count: z.number().optional().describe("The count of items in current page"),
  total: z.number().optional().describe("The total count of items"),
});

// Paginated response schema
export const PaginatedResponseSchema = z.object({
  data: z.array(ServerSchema).describe("The list of servers"),
  metadata: MetadataSchema.optional().describe("Pagination metadata"),
});

// ==================== Type Inference ====================

// Export the inferred types that don't have recursive references
export type Authentication = z.infer<typeof AuthenticationSchema>;
export type Repository = z.infer<typeof RepositorySchema>;
export type VersionDetail = z.infer<typeof VersionDetailSchema>;
export type Package = z.infer<typeof PackageSchema>;
export type Remote = z.infer<typeof RemoteSchema>;
export type Server = z.infer<typeof ServerSchema>;
export type ServerDetail = z.infer<typeof ServerDetailSchema>;
export type ServerCreate = z.infer<typeof ServerCreateSchema>;
export type ServerList = z.infer<typeof ServerListSchema>;
export type PublishRequest = z.infer<typeof PublishRequestSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type PaginatedResponse = z.infer<typeof PaginatedResponseSchema>;
