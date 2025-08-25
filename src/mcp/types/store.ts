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

export const AuthMethodSchema: z.ZodSchema<AuthMethod> = z.nativeEnum(
  AuthMethod,
);
export const FormatSchema: z.ZodSchema<Format> = z.nativeEnum(Format);
export const ArgumentTypeSchema: z.ZodSchema<ArgumentType> = z.nativeEnum(
  ArgumentType,
);

// ==================== Interface Definitions ====================

/**
 * Base input configuration interface for MCP server parameters.
 * Supports recursive properties for nested configurations.
 */
export interface Input {
  /** Human-readable description of the input */
  description?: string;
  /** Whether this input is required for server operation */
  isRequired?: boolean;
  /** Data format type for validation (string, number, boolean, file_path) */
  format?: Format;
  /** Current or default value for the input */
  value?: string;
  /** Whether this input contains sensitive information */
  isSecret?: boolean;
  /** Default value when none is provided */
  default?: string;
  /** Array of valid choices for enumerated inputs */
  choices?: string[];
  /** Template string for dynamic value generation */
  template?: string;
  /** Nested input properties for complex configurations */
  properties?: Record<string, Input>;
}

/**
 * Extended input interface that supports variable substitution.
 * Used for inputs that can reference other configuration values.
 */
export interface InputWithVariables extends Input {
  /** Map of variable names to their input configurations */
  variables?: Record<string, Input>;
}

/**
 * Key-value pair input interface for environment variables and similar configs.
 * Extends InputWithVariables with a required name field.
 */
export interface KeyValueInput extends InputWithVariables {
  /** The key/name for this input pair */
  name: string;
}

/**
 * Command line argument interface for MCP server execution.
 * Supports both positional and named argument types.
 */
export interface Argument extends InputWithVariables {
  /** Type of argument (positional or named) */
  type: ArgumentType;
  /** Optional name for named arguments */
  name?: string;
  /** Whether this argument can be specified multiple times */
  isRepeated?: boolean;
  /** Hint text to help users understand the expected value */
  valueHint?: string;
}

/**
 * Authentication configuration interface for MCP server access.
 */
export interface Authentication {
  /** Authentication method (github, none, etc.) */
  method?: AuthMethod;
  /** Authentication token or credential */
  token?: string;
  /** Repository reference for auth context */
  repoRef?: string;
}

/**
 * Repository information interface for MCP servers hosted in version control.
 */
export interface Repository {
  /** Repository URL (must be a valid URL) */
  url: string;
  /** Source platform (github, gitlab, etc.) */
  source: string;
  /** Repository ID on the hosting platform */
  id: string;
}

/**
 * Version details interface for MCP server releases.
 */
export interface VersionDetail {
  /** Semantic version string */
  version: string;
  /** Release date in ISO 8601 format */
  releaseDate: string;
  /** Whether this is the latest available version */
  isLatest: boolean;
}

/**
 * Package configuration interface for locally executable MCP servers.
 * Contains all information needed to install and run a package-based server.
 */
export interface Package {
  /** Registry/provider name (npm, pip, etc.) */
  registryName: string;
  /** Package name within the registry */
  name: string;
  /** Package version to install */
  version: string;
  /** Optional hint about required runtime environment */
  runtimeHint?: string;
  /** Arguments passed to the runtime when executing */
  runtimeArguments?: Argument[];
  /** Arguments specific to the package configuration */
  packageArguments?: Argument[];
  /** Environment variables required by the server */
  environmentVariables?: KeyValueInput[];
}

/**
 * Remote connection configuration interface for external MCP servers.
 * Used for servers accessed over network protocols.
 */
export interface Remote {
  /** Transport protocol type (SSE, HTTP, WebSocket, etc.) */
  transportType: string;
  /** Connection URL for the remote server */
  url: string;
  /** Custom headers to send with requests */
  headers?: Input[];
}

/**
 * Base server information interface.
 * Contains essential metadata for any MCP server.
 */
export interface Server {
  /** Unique identifier for the server */
  _id: string;
  /** Technical name (e.g., io.github.owner/repo) */
  name: string;
  /** Human-readable description of server functionality */
  description: string;
  /** Repository information where server is hosted */
  repository: Repository;
  /** Optional URL to server icon image */
  iconUrl?: string;
  /** Version information for this server */
  versionDetail: VersionDetail;
}

/**
 * Detailed server configuration interface extending base server info.
 * Includes package and remote connection configurations.
 */
export interface ServerDetail extends Server {
  /** Package configurations for local server installation */
  packages?: Package[];
  /** Remote connection configurations for external servers */
  remotes?: Remote[];
}

/**
 * Server creation interface for new server registration.
 * Omits the auto-generated _id field.
 */
export interface ServerCreate extends Omit<Server, "_id"> {}

/**
 * Server list response interface for paginated API responses.
 */
export interface ServerList {
  /** Array of server information */
  servers: Server[];
  /** Optional cursor for next page */
  next?: string;
  /** Total count of available servers */
  totalCount: number;
}

/**
 * Publish request interface for submitting servers to the MCP store.
 * Extends ServerDetail with authentication information.
 */
export interface PublishRequest extends ServerDetail {
  /** Internal authentication status token */
  authStatusToken?: string;
}

/**
 * Pagination metadata interface for API responses.
 */
export interface Metadata {
  /** Cursor for retrieving the next page */
  nextCursor?: string;
  /** Number of items in current page */
  count?: number;
  /** Total number of items available */
  total?: number;
}

/**
 * Paginated response interface for server listing APIs.
 */
export interface PaginatedResponse {
  /** Array of server data */
  data: Server[];
  /** Optional pagination metadata */
  metadata?: Metadata;
}

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
export const AuthenticationSchema: z.ZodSchema<Authentication> = z.object({
  method: AuthMethodSchema.optional().describe("The authentication method"),
  token: z.string().optional().describe("The authentication token"),
  repoRef: z.string().optional().describe(
    "The repository reference for authentication",
  ),
});

// Repository information schema
export const RepositorySchema: z.ZodSchema<Repository> = z.object({
  url: z.string().url().describe("The repository URL"),
  source: z.string().describe("The source platform (github, gitlab, etc.)"),
  id: z.string().describe("The repository ID on the platform"),
});

// Version details schema
export const VersionDetailSchema: z.ZodSchema<VersionDetail> = z.object({
  version: z.string().describe("The version of the MCP server"),
  releaseDate: z.string().describe(
    "The release date of the MCP server (ISO 8601)",
  ),
  isLatest: z.boolean().describe("Whether this is the latest version"),
});

// Package configuration schema
export const PackageSchema: z.ZodSchema<Package> = z.object({
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
export const RemoteSchema: z.ZodSchema<Remote> = z.object({
  transportType: z.string().describe(
    "The transport type of the MCP server (SSE, HTTP, etc.)",
  ),
  url: z.string().url().describe("The URL of the MCP server"),
  headers: z.array(InputSchema).optional().describe(
    "Custom headers for the connection",
  ),
});

// Base server schema
const $ServerSchema = z.object({
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
export const ServerSchema: z.ZodSchema<Server> = $ServerSchema;

// Detailed server schema - extends base server
const $ServerDetailSchema = $ServerSchema.extend({
  packages: z.array(PackageSchema).optional().describe(
    "The packages of the MCP server",
  ),
  remotes: z.array(RemoteSchema).optional().describe(
    "The remote connections of the MCP server",
  ),
});
export const ServerDetailSchema: z.ZodSchema<ServerDetail> =
  $ServerDetailSchema;

export const ServerCreateSchema: z.ZodSchema<ServerCreate> = $ServerSchema.omit(
  {
    _id: true,
  },
);

// Server list schema
export const ServerListSchema: z.ZodSchema<ServerList> = z.object({
  servers: z.array($ServerSchema).describe("The list of servers"),
  next: z.string().optional().describe("The cursor for the next page"),
  totalCount: z.number().describe("The total count of servers"),
});

// Publish request schema - extends detailed server, adds auth field
export const PublishRequestSchema: z.ZodSchema<PublishRequest> =
  $ServerDetailSchema.extend({
    authStatusToken: z.string().optional().describe(
      "Internal authentication status token (not serialized)",
    ),
  });

// ==================== API Related Schemas ====================

// Pagination metadata schema
export const MetadataSchema: z.ZodSchema<Metadata> = z.object({
  nextCursor: z.string().optional().describe("The cursor for the next page"),
  count: z.number().optional().describe("The count of items in current page"),
  total: z.number().optional().describe("The total count of items"),
});

// Paginated response schema
export const PaginatedResponseSchema: z.ZodSchema<PaginatedResponse> = z.object(
  {
    data: z.array($ServerSchema).describe("The list of servers"),
    metadata: MetadataSchema.optional().describe("Pagination metadata"),
  },
);
