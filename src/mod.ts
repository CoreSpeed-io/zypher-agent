// Public entry point for Zypher Agent SDK
// Re-export core classes, types, and helpers that consumers should rely on.

// Core agent
export {
  ZypherAgent,
  TaskConcurrencyError,
} from "./ZypherAgent.ts";
export type {
  ZypherAgentConfig,
  StreamHandler,
  ToolApprovalHandler,
} from "./ZypherAgent.ts";

// Messaging primitives
export {
  SUPPORTED_FILE_TYPES,
  isMessage,
  isFileAttachment,
  isFileTypeSupported,
  printMessage,
} from "./message.ts";
export type {
  Message,
  ContentBlock,
  FileAttachment,
  SupportedFileTypes,
} from "./message.ts";

// Storage service interfaces
export type {
  StorageService,
  AttachmentMetadata,
  UploadOptions,
  UploadResult,
  GenerateUploadUrlResult,
} from "./storage/StorageService.ts";

// Tooling helpers
export type { Tool, BaseParams } from "./tools/mod.ts";
export {
  defineTool,
  createTool,
} from "./tools/mod.ts";

// Error utilities
export {
  AbortError,
  isAbortError,
  formatError,
} from "./error.ts"; 