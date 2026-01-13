/**
 * Skill validation functions following the Agent Skills specification.
 * @module
 */

import { exists } from "@std/fs";
import { basename, resolve } from "@std/path";
import {
  findSkillMd,
  parseFrontmatter,
  type RawFrontmatter,
  type SkillMetadata,
} from "./skill.ts";

/** Maximum length for skill name */
const MAX_NAME_LENGTH = 64;
/** Maximum length for skill description */
const MAX_DESCRIPTION_LENGTH = 1024;
/** Maximum length for compatibility field */
const MAX_COMPATIBILITY_LENGTH = 500;

/** Allowed fields in SKILL.md frontmatter */
const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "allowed-tools",
  "metadata",
]);

/**
 * Result of validating skill metadata.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate skill metadata fields.
 *
 * Checks:
 * - Name is lowercase, max 64 chars, valid characters
 * - No leading/trailing/consecutive hyphens
 * - Description max 1024 chars
 * - Compatibility max 500 chars (if present)
 *
 * @param metadata Skill metadata to validate
 * @returns Validation result with any errors
 */
export function validateSkillMetadata(
  metadata: SkillMetadata,
): ValidationResult {
  const errors: string[] = [];

  // Validate name
  const nameErrors = validateName(metadata.name);
  errors.push(...nameErrors);

  // Validate description length
  if (metadata.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(
      `Description exceeds ${MAX_DESCRIPTION_LENGTH} character limit (${metadata.description.length} chars)`,
    );
  }

  // Validate compatibility length if present
  if (
    metadata.compatibility &&
    metadata.compatibility.length > MAX_COMPATIBILITY_LENGTH
  ) {
    errors.push(
      `Compatibility exceeds ${MAX_COMPATIBILITY_LENGTH} character limit (${metadata.compatibility.length} chars)`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a skill name.
 *
 * Rules:
 * - Max 64 characters
 * - Must be lowercase (Unicode-aware)
 * - Cannot start or end with hyphen
 * - No consecutive hyphens
 * - Only alphanumeric, hyphens, and Unicode letters allowed
 *
 * @param name Skill name to validate
 * @returns Array of error messages (empty if valid)
 */
function validateName(name: string): string[] {
  const errors: string[] = [];

  // NFKC normalize for consistent comparison
  const normalized = name.normalize("NFKC");

  // Check length
  if (normalized.length > MAX_NAME_LENGTH) {
    errors.push(
      `Name exceeds ${MAX_NAME_LENGTH} character limit (${normalized.length} chars)`,
    );
  }

  // Check for uppercase characters (Unicode-aware)
  if (normalized !== normalized.toLowerCase()) {
    errors.push("Name must be lowercase");
  }

  // Check for leading/trailing hyphens
  if (normalized.startsWith("-") || normalized.endsWith("-")) {
    errors.push("Name cannot start or end with a hyphen");
  }

  // Check for consecutive hyphens
  if (normalized.includes("--")) {
    errors.push("Name cannot contain consecutive hyphens");
  }

  // Check for invalid characters (only allow letters, numbers, hyphens)
  // Unicode letters are allowed (Chinese, Russian, etc.)
  const invalidCharPattern = /[^a-z0-9\-\p{L}]/u;
  if (invalidCharPattern.test(normalized)) {
    errors.push(
      "Name contains invalid characters (only letters, numbers, and hyphens allowed)",
    );
  }

  return errors;
}

/**
 * Check for unexpected fields in frontmatter.
 *
 * @param raw Raw frontmatter data
 * @returns Array of unexpected field names
 */
function getUnexpectedFields(raw: RawFrontmatter): string[] {
  const unexpected: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_FIELDS.has(key)) {
      unexpected.push(key);
    }
  }
  return unexpected;
}

/**
 * Validate a skill directory.
 *
 * This is the main entry point for full validation. It checks:
 * - Directory exists
 * - SKILL.md file exists
 * - Valid YAML frontmatter
 * - Required fields present
 * - No unexpected fields
 * - Name matches directory name
 * - All metadata validation rules
 *
 * @param skillDir Path to the skill directory
 * @returns Array of error messages (empty if valid)
 */
export async function validateSkillDir(skillDir: string): Promise<string[]> {
  const errors: string[] = [];
  const dir = resolve(skillDir);

  // Check directory exists
  if (!await exists(dir)) {
    return [`Path does not exist: ${dir}`];
  }

  // Check it's a directory
  const stat = await Deno.stat(dir);
  if (!stat.isDirectory) {
    return [`Not a directory: ${dir}`];
  }

  // Find SKILL.md
  const skillMdPath = await findSkillMd(dir);
  if (!skillMdPath) {
    return [`Missing required file: SKILL.md`];
  }

  // Parse frontmatter
  const content = await Deno.readTextFile(skillMdPath);
  const raw = parseFrontmatter(content);
  if (!raw) {
    return [`Invalid or missing YAML frontmatter in SKILL.md`];
  }

  // Check required fields
  if (!raw.name || typeof raw.name !== "string" || !raw.name.trim()) {
    errors.push("Missing required field: name");
  }
  if (
    !raw.description || typeof raw.description !== "string" ||
    !raw.description.trim()
  ) {
    errors.push("Missing required field: description");
  }

  // Check for unexpected fields
  const unexpected = getUnexpectedFields(raw);
  if (unexpected.length > 0) {
    errors.push(`Unexpected fields in frontmatter: ${unexpected.join(", ")}`);
  }

  // If we have errors from missing fields, return early
  if (errors.length > 0) {
    return errors;
  }

  // Validate name matches directory (with NFKC normalization)
  const dirName = basename(dir).normalize("NFKC");
  const skillName = (raw.name as string).trim().normalize("NFKC");
  if (dirName !== skillName) {
    errors.push(
      `Directory name "${dirName}" must match skill name "${skillName}"`,
    );
  }

  // Validate metadata fields
  const metadata: SkillMetadata = {
    name: (raw.name as string).trim(),
    description: (raw.description as string).trim(),
  };

  if (typeof raw.license === "string") {
    metadata.license = raw.license.trim();
  }
  if (typeof raw.compatibility === "string") {
    metadata.compatibility = raw.compatibility.trim();
  }
  if (typeof raw["allowed-tools"] === "string") {
    metadata.allowedTools = raw["allowed-tools"].trim();
  }
  if (raw.metadata && typeof raw.metadata === "object") {
    metadata.metadata = raw.metadata as Record<string, string>;
  }

  const result = validateSkillMetadata(metadata);
  errors.push(...result.errors);

  return errors;
}
