export * from "./McpClient.ts";
export * from "./McpServerManager.ts";

export * from "./utils.ts";
export * from "./connect.ts";

export * from "./InMemoryOAuthProvider.ts";

/** Command configuration for local MCP server execution */
export interface McpCommandConfig {
  /** Command to execute the MCP server */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables for the server */
  env?: Record<string, string>;
}

/** Remote connection configuration for external MCP servers */
export interface McpRemoteConfig {
  /** Connection URL for the remote server */
  url: string;
  /** Custom headers for the connection */
  headers?: Record<string, string>;
}

/** Server endpoint information for connecting to an MCP server */
export type McpServerEndpoint =
  & {
    /** Kebab-case identifier used as key (e.g., "github-copilot") */
    id: string;
    /** Human-readable display name (e.g., "GitHub Copilot") */
    displayName?: string;
  }
  & (
    | {
      /** CLI command configuration for local server execution */
      command: McpCommandConfig;
      remote?: never;
    }
    | {
      /** Remote server configuration for HTTP/SSE connections */
      remote: McpRemoteConfig;
      command?: never;
    }
  );
