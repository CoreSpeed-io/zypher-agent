/**
 * Tool Definition Builder - generates prompts for code execution tools.
 */

import type { ToolDefinitions } from "./protocol.ts";

export function generateProgrammaticToolPrompt(
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
