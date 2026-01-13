/**
 * Skill metadata parsed from SKILL.md frontmatter
 */
export interface SkillMetadata {
  /** Skill name in kebab-case (max 64 chars, lowercase letters, numbers, hyphens only) */
  name: string;
  /** Brief description of what the Skill does and when to use it (max 1024 chars) */
  description: string;
  /** License for the skill (optional) */
  license?: string;
  /** Compatibility information for the skill (optional, max 500 chars) */
  compatibility?: string;
  /** Tool patterns the skill requires (optional, experimental) */
  allowedTools?: string;
  /** Key-value pairs for client-specific properties (optional) */
  metadata?: Record<string, string>;
}

/**
 * Skill with its metadata and location
 */
export interface Skill {
  /** Skill metadata */
  metadata: SkillMetadata;
  /** Path to SKILL.md file (relative for project skills, absolute for global/custom) */
  location: string;
}

/**
 * Validates Skill metadata according to the agentskills specification
 */
export function validateSkillMetadata(
  metadata: SkillMetadata,
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate name
  if (!metadata.name) {
    errors.push("Skill name is required");
  } else {
    if (metadata.name.length > 64) {
      errors.push("Skill name must be 64 characters or less");
    }
    if (!/^[a-z0-9-]+$/.test(metadata.name)) {
      errors.push(
        "Skill name must contain only lowercase letters, numbers, and hyphens",
      );
    }
    if (metadata.name.startsWith("-") || metadata.name.endsWith("-")) {
      errors.push("Skill name cannot start or end with a hyphen");
    }
    if (metadata.name.includes("--")) {
      errors.push("Skill name cannot contain consecutive hyphens");
    }
    if (
      metadata.name.includes("anthropic") || metadata.name.includes("claude")
    ) {
      errors.push(
        "Skill name cannot contain reserved words: 'anthropic' or 'claude'",
      );
    }
  }

  // Validate description
  if (!metadata.description) {
    errors.push("Skill description is required");
  } else {
    if (metadata.description.length > 1024) {
      errors.push("Skill description must be 1024 characters or less");
    }
  }

  // Validate compatibility (optional)
  if (
    metadata.compatibility !== undefined && metadata.compatibility.length > 500
  ) {
    errors.push("Skill compatibility must be 500 characters or less");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
