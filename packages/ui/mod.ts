/**
 * React hooks and utilities for Zypher Agent UI integration.
 *
 * Provides reactive state management for MCP servers via WebSocket,
 * along with helpers for matching MCP client status patterns.
 *
 * @example
 * ```tsx
 * import { useMcpServers, matchStatus } from "@zypher/ui";
 *
 * function McpPanel() {
 *   const { servers, isLoading } = useMcpServers({
 *     apiBaseUrl: "ws://localhost:3000",
 *   });
 *
 *   if (isLoading) return <p>Loading...</p>;
 *
 *   return (
 *     <ul>
 *       {Object.values(servers).map((s) => (
 *         <li key={s.serverId}>
 *           {s.serverId} — {matchStatus(s.status, "connected") ? "online" : "offline"}
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @module
 */

// MCP server hooks and types
export { matchStatus, useMcpServers } from "./use_mcp_servers.ts";
export type {
  McpServerState,
  StatusPattern,
  UseMcpServersOptions,
  UseMcpServersReturn,
} from "./use_mcp_servers.ts";

// Agent context provider and hook
export { AgentProvider, useAgentContext } from "./agent_context.tsx";
export type { AgentProviderOptions } from "./agent_context.tsx";

// Agent hook and types
export { getFormattedToolName, useAgent } from "./use_agent.ts";
export type {
  CompleteMessage,
  StreamingMessage,
  StreamingTextMessage,
  StreamingToolUseMessage,
  UseAgentOptions,
  UseAgentReturn,
} from "./use_agent.ts";

// Task API client
export { TaskApiClient } from "./task_api_client.ts";
export type {
  StartTaskOptions,
  TaskApiClientOptions,
  TaskConnection,
} from "./task_api_client.ts";

// Utilities
export { toWebSocketUrl } from "./utils.ts";

// Re-exported types from @zypher/agent
export type {
  McpClientStatus,
  McpServerEndpoint,
  McpServerSource,
} from "@zypher/agent";

// Re-exported types from @zypher/http
export type { HttpTaskEvent, HttpTaskEventId } from "@zypher/http";
