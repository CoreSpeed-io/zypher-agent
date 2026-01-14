/**
 * Skill validation functions following the Agent Skills specification.
 * @module
 */

import type { SkillMetadata } from "./skill.ts";

/** Maximum length for skill name */
const MAX_NAME_LENGTH = 64;
/** Maximum length for skill description */
const MAX_DESCRIPTION_LENGTH = 1024;
/** Maximum length for compatibility field */
const MAX_COMPATIBILITY_LENGTH = 500;

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
