/**
 * Core skill types and parsing functions.
 */

import { extractYaml } from "@std/front-matter";

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
 * Convert raw frontmatter to SkillMetadata.
 * Returns undefined if required fields are missing or invalid.
 *
 * @param raw Raw parsed frontmatter
 * @returns SkillMetadata or undefined if invalid
 */
export function toSkillMetadata(
  raw: Record<string, unknown>,
): SkillMetadata | undefined {
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    return undefined;
  }
  if (typeof raw.description !== "string" || !raw.description.trim()) {
    return undefined;
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

  if (
    raw.metadata && typeof raw.metadata === "object" &&
    !Array.isArray(raw.metadata)
  ) {
    const entries = Object.entries(raw.metadata).map(
      ([k, v]) => [String(k), String(v)],
    );
    if (entries.length > 0) {
      metadata.metadata = Object.fromEntries(entries);
    }
  }

  return metadata;
}

/**
 * Parse SKILL.md content and return metadata.
 *
 * @param content SKILL.md file content with YAML frontmatter
 * @returns SkillMetadata or undefined if invalid
 */
export function parseSkill(content: string): SkillMetadata | undefined {
  try {
    const { attrs } = extractYaml<Record<string, unknown>>(content);
    return toSkillMetadata(attrs);
  } catch {
    return undefined;
  }
}
