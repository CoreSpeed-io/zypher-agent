/**
 * MCP Registry module
 * Provides interface for discovering MCP servers from registries
 *
 * Registry providers return McpServerEndpoint directly
 */

export type {
  RegistryListResult,
  RegistryProvider,
} from "./RegistryProvider.ts";
