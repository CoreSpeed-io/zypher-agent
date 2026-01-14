/**
 * Skill discovery functions.
 * @module
 */

import { exists } from "@std/fs";
import { join, resolve } from "@std/path";
import { parseSkill, type Skill } from "./skill.ts";
import { validateSkillMetadata } from "./validator.ts";

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
 * Options for skill discovery.
 */
export interface DiscoverOptions {
  /** Called when a skill directory is missing SKILL.md */
  onMissingSkillMd?: (dirName: string) => void;
  /** Called when a skill fails to load */
  onLoadError?: (dirName: string, error: unknown) => void;
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
      options?.onLoadError?.(entry.name, error);
    }
  }

  return skills;
}
