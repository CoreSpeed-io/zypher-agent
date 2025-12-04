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
} from "./ProgrammaticToolCallingProtocol.ts";

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
