// Public entry point for Zypher Agent SDK
// Re-export core classes, types, and helpers that consumers should rely on.

// Core agent
export { TaskConcurrencyError, ZypherAgent } from "./ZypherAgent.ts";
export type {
  StreamHandler,
  ToolApprovalHandler,
  ZypherAgentConfig,
} from "./ZypherAgent.ts";

// MCP server management
export { McpServerManager } from "./mcp/McpServerManager.ts";
export type { ZypherMcpServer } from "./mcp/types/local.ts";
export type { OAuthProviderOptions } from "./mcp/types/auth.ts";

// Messaging primitives
export {
  isFileAttachment,
  isFileTypeSupported,
  isMessage,
  printMessage,
  SUPPORTED_FILE_TYPES,
} from "./message.ts";
export type {
  ContentBlock,
  FileAttachment,
  Message,
  SupportedFileTypes,
} from "./message.ts";

// Storage service interfaces
export type {
  AttachmentMetadata,
  GenerateUploadUrlResult,
  StorageService,
  UploadOptions,
  UploadResult,
} from "./storage/StorageService.ts";
export {
  type S3Options,
  S3StorageService,
} from "./storage/S3StorageService.ts";
export { FileNotFoundError, StorageError } from "./storage/StorageErrors.ts";

// Tooling helpers
export type { BaseParams, Tool } from "./tools/mod.ts";
export { createTool, defineTool } from "./tools/mod.ts";

// Error utilities
export { AbortError, formatError, isAbortError } from "./error.ts";

// CLI
export { runAgentInTerminal } from "./cli.ts";
