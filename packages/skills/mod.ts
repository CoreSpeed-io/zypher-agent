/**
 * @zypher/skills - Core skill parsing and validation library
 *
 * This package provides utilities for working with Agent Skills:
 * - Parse SKILL.md frontmatter
 * - Validate skill metadata and directories
 * - Generate XML prompt blocks for agents
 *
 * @module
 */

export {
  findSkillMd,
  parseFrontmatter,
  readSkill,
  type RawFrontmatter,
  type Skill,
  type SkillMetadata,
  toSkillMetadata,
} from "./skill.ts";

export {
  validateSkillDir,
  validateSkillMetadata,
  type ValidationResult,
} from "./validator.ts";

export { escapeHtml, toPrompt } from "./prompt.ts";
