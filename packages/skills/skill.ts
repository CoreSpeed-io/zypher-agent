/**
 * Core skill types and parsing functions.
 * @module
 */

import { exists } from "@std/fs";
import { extractYaml } from "@std/front-matter";
import { join, resolve } from "@std/path";
import { validateSkillMetadata } from "./validator.ts";

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
    const entries = Object.entries(raw.metadata).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    if (entries.length > 0) {
      metadata.metadata = Object.fromEntries(entries);
    }
  }

  return metadata;
}

/**
 * Find SKILL.md file in a skill directory.
 *
 * Prefers uppercase SKILL.md but accepts lowercase skill.md as fallback.
 *
 * @param skillDir Path to the skill directory
 * @returns Absolute path to SKILL.md or undefined if not found
 */
export async function findSkillMd(
  skillDir: string,
): Promise<string | undefined> {
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

  return undefined;
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

/**
 * Read and parse a skill from a directory.
 *
 * @param skillDir Path to the skill directory
 * @returns Skill object or undefined if invalid
 */
export async function readSkill(skillDir: string): Promise<Skill | undefined> {
  const location = await findSkillMd(skillDir);
  if (!location) {
    return undefined;
  }

  try {
    const content = await Deno.readTextFile(location);
    const metadata = parseSkill(content);
    if (!metadata) {
      return undefined;
    }
    return { metadata, location };
  } catch {
    return undefined;
  }
}

/**
 * Options for skill discovery.
 */
export interface DiscoverOptions {
  /** Called when a skill directory is missing SKILL.md */
  onMissingSkillMd?: (dirName: string) => void;
  /** Called when a skill fails to load */
  onLoadError?: (dirName: string, error: Error) => void;
  /** Called when a skill has invalid metadata */
  onInvalidMetadata?: (path: string, errors: string[]) => void;
}

/**
 * Discover all skills in a directory.
 *
 * Scans the given directory for subdirectories containing SKILL.md files,
 * parses and validates each skill, and returns an array of valid skills.
 *
 * @param skillsDir Path to the directory containing skill subdirectories
 * @param options Optional callbacks for handling errors
 * @returns Array of discovered skills
 */
export async function discoverSkills(
  skillsDir: string,
  options?: DiscoverOptions,
): Promise<Skill[]> {
  const dir = resolve(skillsDir);

  if (!await exists(dir)) {
    return [];
  }

  const skills: Skill[] = [];

  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isDirectory) {
        continue;
      }

      const skillDir = join(dir, entry.name);
      const skillMdPath = await findSkillMd(skillDir);

      if (!skillMdPath) {
        options?.onMissingSkillMd?.(entry.name);
        continue;
      }

      try {
        const content = await Deno.readTextFile(skillMdPath);
        const metadata = parseSkill(content);
        if (!metadata) {
          options?.onInvalidMetadata?.(skillMdPath, [
            "Missing required fields: name, description",
          ]);
          continue;
        }

        const validation = validateSkillMetadata(metadata);
        if (!validation.valid) {
          options?.onInvalidMetadata?.(skillMdPath, validation.errors);
          continue;
        }

        skills.push({ metadata, location: skillMdPath });
      } catch (error) {
        options?.onLoadError?.(
          entry.name,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  } catch {
    // Directory read failed, return empty array
    return [];
  }

  return skills;
}
