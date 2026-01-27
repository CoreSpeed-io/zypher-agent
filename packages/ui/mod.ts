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

export { matchStatus, useMcpServers } from "./use_mcp_servers.ts";

export type {
  McpServerState,
  StatusPattern,
  UseMcpServersOptions,
  UseMcpServersReturn,
} from "./use_mcp_servers.ts";

// Re-export types from @zypher/agent used in McpServerState
export type {
  McpClientStatus,
  McpServerEndpoint,
  McpServerSource,
} from "@zypher/agent";
