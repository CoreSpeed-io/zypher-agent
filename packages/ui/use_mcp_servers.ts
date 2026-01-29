import type {
  McpClientStatus,
  McpServerEndpoint,
  McpServerSource,
} from "@zypher/agent";
import type { McpWebSocketEvent } from "@zypher/http";
import { useCallback, useEffect, useState } from "react";
import { retry, timer } from "rxjs";
import { webSocket } from "rxjs/webSocket";
import { toWebSocketUrl } from "./utils.ts";

// WebSocket protocol version
const MCP_WEBSOCKET_PROTOCOL = "zypher.mcp.v1";

/** Represents the current state of an MCP server, including its connection status and configuration. */
export interface McpServerState {
  /** Unique identifier for this MCP server. */
  serverId: string;
  /** Server endpoint configuration (transport, URL, etc.). */
  server: McpServerEndpoint;
  /** Where this server was discovered from (registry or direct config). */
  source: McpServerSource;
  /** Current connection status of the MCP client. */
  status: McpClientStatus;
  /** Whether this server is enabled for use. */
  enabled: boolean;
  /** OAuth authorization URL when the server is awaiting OAuth approval. */
  pendingOAuthUrl?: string;
}

/** Dot-notation patterns for matching MCP client status states and sub-states. */
export type StatusPattern =
  | "disconnected"
  | "connecting"
  | "connecting.initializing"
  | "connecting.awaitingOAuth"
  | "connected"
  | "connected.initial"
  | "connected.toolDiscovered"
  | "disconnecting"
  | "disconnectingDueToError"
  | "error"
  | "aborting"
  | "disposed";
/**
 * Helper function to match MCP client status patterns (similar to XState's matches).
 *
 * @example
 * // Match exact string status
 * matchStatus(status, "disconnected") // true if status === "disconnected"
 *
 * // Match parent state (any connecting sub-state)
 * matchStatus(status, "connecting") // true if status is { connecting: "initializing" } or { connecting: "awaitingOAuth" }
 *
 * // Match specific sub-state
 * matchStatus(status, "connecting.awaitingOAuth") // true only if status is { connecting: "awaitingOAuth" }
 * matchStatus(status, "connected.toolDiscovered") // true only if status is { connected: "toolDiscovered" }
 */
export function matchStatus(
  status: McpClientStatus,
  pattern: StatusPattern,
): boolean {
  // Handle dot notation for nested states
  if (pattern.includes(".")) {
    const [parent, child] = pattern.split(".");
    if (typeof status === "object" && parent in status) {
      return (status as Record<string, string>)[parent] === child;
    }
    return false;
  }

  // Handle string statuses
  if (typeof status === "string") {
    return status === pattern;
  }

  // Handle object statuses - match parent state
  if (typeof status === "object") {
    return pattern in status;
  }

  return false;
}

/** Return value of the {@link useMcpServers} hook. */
export interface UseMcpServersReturn {
  /** Map of server ID to its current state. */
  servers: Record<string, McpServerState>;
  /** Whether the initial state has been received from the WebSocket. */
  isLoading: boolean;
}

/** Options for the {@link useMcpServers} hook. */
export interface UseMcpServersOptions {
  /**
   * Base URL of the API server (e.g. `ws://localhost:3000`).
   * `http://`/`https://` URLs are automatically converted to `ws://`/`wss://`.
   */
  apiBaseUrl: string;
  /** Whether to connect to the WebSocket. @default true */
  enabled?: boolean;
}

/**
 * Hook that maintains a WebSocket connection to the MCP server state stream.
 * Automatically reconnects on disconnect and keeps server state in sync.
 */
export function useMcpServers(
  { apiBaseUrl, enabled = true }: UseMcpServersOptions,
): UseMcpServersReturn {
  const [servers, setServers] = useState<Record<string, McpServerState>>({});
  const [isLoading, setIsLoading] = useState(true);

  const handleMessage = useCallback((data: McpWebSocketEvent) => {
    switch (data.type) {
      case "initial_state": {
        setIsLoading(false);
        const serverRecord: Record<string, McpServerState> = {};
        for (const server of data.servers) {
          serverRecord[server.serverId] = server;
        }
        setServers(serverRecord);
        break;
      }

      case "server_added":
        setServers((prev) => ({
          ...prev,
          [data.serverId]: {
            serverId: data.serverId,
            server: data.server,
            source: data.source,
            status: "disconnected",
            enabled: false,
          },
        }));
        break;

      case "server_updated":
        setServers((prev) => {
          const existing = prev[data.serverId];
          if (!existing) return prev;

          return {
            ...prev,
            [data.serverId]: {
              ...existing,
              ...(data.updates.server && { server: data.updates.server }),
              ...(data.updates.enabled !== undefined && {
                enabled: data.updates.enabled,
              }),
            },
          };
        });
        break;

      case "server_removed":
        setServers((prev) => {
          const { [data.serverId]: _, ...rest } = prev;
          return rest;
        });
        break;

      case "client_status_changed":
        setServers((prev) => {
          const existing = prev[data.serverId];
          if (!existing) return prev;

          // Only keep pendingOAuthUrl if status is awaitingOAuth
          const isAwaitingOAuth = matchStatus(
            data.status,
            "connecting.awaitingOAuth",
          );

          return {
            ...prev,
            [data.serverId]: {
              ...existing,
              status: data.status,
              pendingOAuthUrl: isAwaitingOAuth
                ? data.pendingOAuthUrl
                : undefined,
            },
          };
        });
        break;
    }
  }, []);

  const connect = useCallback(() => {
    const wsUrl = `${toWebSocketUrl(apiBaseUrl)}/mcp/ws`;

    const ws$ = webSocket<McpWebSocketEvent>({
      url: wsUrl,
      protocol: MCP_WEBSOCKET_PROTOCOL,
    });

    const subscription = ws$
      .pipe(
        retry({
          count: 10,
          delay: (_error, retryCount) => {
            // Exponential backoff with a maximum of 30 seconds
            const backoff = Math.min(1000 * 2 ** retryCount, 30000);
            console.log(
              `[MCP WebSocket] Connection failed, retrying in ${backoff}ms... (attempt ${retryCount}/10)`,
            );
            return timer(backoff);
          },
          resetOnSuccess: true,
        }),
      )
      .subscribe({
        next: handleMessage,
      });

    return subscription;
  }, [apiBaseUrl, handleMessage]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const subscription = connect();
    return () => subscription.unsubscribe();
  }, [connect, enabled]);

  return {
    servers,
    isLoading,
  };
}
