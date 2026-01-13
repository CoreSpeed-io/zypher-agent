/**
 * Generate XML prompt blocks for agent skills.
 * @module
 */

import type { Skill } from "./skill.ts";

/**
 * Escape HTML/XML special characters for safe inclusion in XML.
 *
 * @param text Text to escape
 * @returns Escaped text safe for XML
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generate the `<available_skills>` XML block for inclusion in agent prompts.
 *
 * This XML format follows the Agent Skills specification recommended for
 * Claude models. Skill Clients may format skill information differently
 * to suit their models or preferences.
 *
 * @param skills Array of skills to include
 * @returns XML string with available_skills block
 *
 * @example
 * ```typescript
 * const xml = toPrompt([{
 *   metadata: { name: "pdf-reader", description: "Read PDF files" },
 *   location: "/path/to/pdf-reader/SKILL.md"
 * }]);
 * // Returns:
 * // <available_skills>
 * // <skill>
 * // <name>pdf-reader</name>
 * // <description>Read PDF files</description>
 * // <location>/path/to/pdf-reader/SKILL.md</location>
 * // </skill>
 * // </available_skills>
 * ```
 */
export function toPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return "<available_skills>\n</available_skills>";
  }

  const lines: string[] = ["<available_skills>"];

  for (const skill of skills) {
    lines.push("<skill>");
    lines.push("<name>");
    lines.push(escapeHtml(skill.metadata.name));
    lines.push("</name>");
    lines.push("<description>");
    lines.push(escapeHtml(skill.metadata.description));
    lines.push("</description>");
    lines.push("<location>");
    lines.push(skill.location);
    lines.push("</location>");
    lines.push("</skill>");
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}
