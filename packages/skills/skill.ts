/**
 * Core skill types and frontmatter parsing functions.
 * @module
 */

import { exists } from "@std/fs";
import { join, resolve } from "@std/path";

/**
 * Skill metadata parsed from SKILL.md frontmatter.
 */
export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string;
  metadata?: Record<string, string>;
}

/**
 * Skill with its metadata and file location.
 */
export interface Skill {
  metadata: SkillMetadata;
  /** Absolute path to the SKILL.md file */
  location: string;
}

/**
 * Raw frontmatter data before validation.
 * Used internally for parsing.
 */
export interface RawFrontmatter {
  name?: unknown;
  description?: unknown;
  license?: unknown;
  compatibility?: unknown;
  "allowed-tools"?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 *
 * Uses a simple YAML parser that handles the common frontmatter format.
 * Returns null if no valid frontmatter is found.
 *
 * @param content Raw content of SKILL.md file
 * @returns Parsed frontmatter data or null if invalid
 */
export function parseFrontmatter(content: string): RawFrontmatter | null {
  if (!content.startsWith("---")) {
    return null;
  }

  const parts = content.split("---");
  if (parts.length < 3) {
    return null;
  }

  // parts[0] is empty (before first ---)
  // parts[1] is the frontmatter YAML
  // parts[2+] is the body content
  const yamlContent = parts[1].trim();
  if (!yamlContent) {
    return null;
  }

  return parseSimpleYaml(yamlContent);
}

/**
 * Simple YAML parser for frontmatter.
 * Handles basic key-value pairs and nested objects.
 */
function parseSimpleYaml(yaml: string): RawFrontmatter {
  const result: RawFrontmatter = {};
  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let currentIndent = 0;
  let nestedObject: Record<string, string> | null = null;

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;

    // Count leading spaces
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Check if this is a nested line
    if (indent > currentIndent && currentKey && nestedObject !== null) {
      // Parse nested key-value
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();
        nestedObject[key] = value;
      }
      continue;
    }

    // Parse top-level key-value
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      // If value is empty, this might be start of nested object
      if (!value) {
        currentKey = key;
        currentIndent = indent;
        nestedObject = {};
        result[key] = nestedObject;
      } else {
        result[key] = value;
        currentKey = null;
        nestedObject = null;
      }
    }
  }

  return result;
}

/**
 * Convert raw frontmatter to SkillMetadata.
 * Returns null if required fields are missing or invalid.
 *
 * @param raw Raw parsed frontmatter
 * @returns SkillMetadata or null if invalid
 */
export function toSkillMetadata(raw: RawFrontmatter): SkillMetadata | null {
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    return null;
  }
  if (typeof raw.description !== "string" || !raw.description.trim()) {
    return null;
  }

  const metadata: SkillMetadata = {
    name: raw.name.trim(),
    description: raw.description.trim(),
  };

  if (typeof raw.license === "string" && raw.license.trim()) {
    metadata.license = raw.license.trim();
  }

  if (typeof raw.compatibility === "string" && raw.compatibility.trim()) {
    metadata.compatibility = raw.compatibility.trim();
  }

  if (
    typeof raw["allowed-tools"] === "string" && raw["allowed-tools"].trim()
  ) {
    metadata.allowedTools = raw["allowed-tools"].trim();
  }

  if (raw.metadata && typeof raw.metadata === "object") {
    metadata.metadata = raw.metadata as Record<string, string>;
  }

  return metadata;
}

/**
 * Find SKILL.md file in a skill directory.
 *
 * Prefers uppercase SKILL.md but accepts lowercase skill.md as fallback.
 *
 * @param skillDir Path to the skill directory
 * @returns Absolute path to SKILL.md or null if not found
 */
export async function findSkillMd(skillDir: string): Promise<string | null> {
  const dir = resolve(skillDir);

  // Prefer uppercase SKILL.md
  const uppercase = join(dir, "SKILL.md");
  if (await exists(uppercase)) {
    return uppercase;
  }

  // Fallback to lowercase
  const lowercase = join(dir, "skill.md");
  if (await exists(lowercase)) {
    return lowercase;
  }

  return null;
}

/**
 * Read and parse a skill from a directory.
 *
 * @param skillDir Path to the skill directory
 * @returns Skill object or null if invalid
 */
export async function readSkill(skillDir: string): Promise<Skill | null> {
  const location = await findSkillMd(skillDir);
  if (!location) {
    return null;
  }

  const content = await Deno.readTextFile(location);
  const raw = parseFrontmatter(content);
  if (!raw) {
    return null;
  }

  const metadata = toSkillMetadata(raw);
  if (!metadata) {
    return null;
  }

  return { metadata, location };
}
