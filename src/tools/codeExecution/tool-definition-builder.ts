/**
 * Tool Definition Builder - extracts tool signatures from McpServerManager
 * for use in code execution context.
 *
 * Tool Naming Convention:
 * - MCP tools: "mcp__{serverId}__{toolName}" (e.g., "mcp__slack__send_message")
 * - Non-MCP tools: just "{toolName}" (e.g., "read_file") - no prefix
 */

import type { McpServerManager } from "../../mcp/McpServerManager.ts";
import type {
  ToolDefinition,
  ToolDefinitions,
} from "./programmatic-tool-calling-protocol.ts";

/** Prefix for MCP server tools */
export const MCP_PREFIX = "mcp__";

/**
 * Build tool definitions from McpServerManager.
 * Returns flat array of ToolDefinitions for serialization to Worker.
 *
 * Tool names follow the convention:
 * - MCP tools: "mcp__{serverId}__{toolName}" (e.g., "mcp__slack__send_message")
 * - Non-MCP tools: just "{toolName}" (e.g., "read_file") - no prefix
 *
 * @param mcpServerManager - The MCP server manager to extract tools from
 * @returns Flat array of tool definitions
 */
export function buildToolDefinitions(
  mcpServerManager: McpServerManager,
): ToolDefinitions {
  const definitions: ToolDefinition[] = [];
  const codeExecTools = mcpServerManager.codeExecutionTools;

  // Add all registered tools
  for (const tool of codeExecTools) {
    definitions.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    });
  }

  return definitions;
}

// TODO: fix it after merging new tool api design
export function parseToolName(toolName: string): {
  type: "mcp_tool" | "tool";
  serverId?: string;
  toolName: string;
} {
  if (toolName.startsWith(MCP_PREFIX)) {
    // Format: "mcp__{serverId}__{toolName}"
    const rest = toolName.slice(MCP_PREFIX.length);
    const separatorIndex = rest.indexOf("__");
    if (separatorIndex === -1) {
      throw new Error(`Invalid MCP tool name format: ${toolName}`);
    }
    return {
      type: "mcp_tool",
      serverId: rest.slice(0, separatorIndex),
      toolName: rest.slice(separatorIndex + 2),
    };
  } else {
    // Non-MCP tools: just the tool name, no prefix
    return {
      type: "tool",
      toolName: toolName,
    };
  }
}

export function generateCodeExecutionToolsPrompt(
  toolDefinitions: ToolDefinitions,
): string {
  if (toolDefinitions.length === 0) {
    return "";
  }

  const lines: string[] = ["## Available Tools for Code Execution", ""];

  for (const tool of toolDefinitions) {
    lines.push(`### tools.${tool.name}(input: inputSchema)`);
    lines.push(tool.description);
    lines.push("inputSchema:");
    lines.push("```json");
    lines.push(JSON.stringify(tool.parameters, null, 2));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}
