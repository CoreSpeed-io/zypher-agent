/** Basic tool information */
export interface ToolInfo {
  name: string;
  description: string;
}

/** Base properties for all MCP server info */
interface McpServerInfoBase {
  id: string;
  tools: ToolInfo[];
}

/** Info for a command-based MCP server (local process) */
interface CommandMcpServerInfo extends McpServerInfoBase {
  type: "command";
  command: string;
  args?: string[];
}

/** Info for a remote MCP server (HTTP connection) */
interface RemoteMcpServerInfo extends McpServerInfoBase {
  type: "remote";
  url: string;
}

/** MCP server runtime info - either command-based or remote */
export type McpServerInfo = CommandMcpServerInfo | RemoteMcpServerInfo;

/**
 * Complete runtime information about an agent.
 * Returned by the /user-agent/info endpoint.
 */
export interface AgentInfo {
  name: string;
  description: string;
  model: string;
  tools: ToolInfo[];
  mcpServers: McpServerInfo[];
}
