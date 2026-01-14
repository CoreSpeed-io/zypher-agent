/**
 * @zypher/skills - Core Agent Skills parsing and validation library
 *
 * This package provides utilities for working with Agent Skills:
 * - Discover and load skills from directories
 * - Validate skill metadata and directories
 * - Generate XML prompt blocks for agents
 *
 * @module
 */

export {
  type DiscoverOptions,
  discoverSkills,
  findSkillMd,
  parseSkill,
  readSkill,
  type Skill,
  type SkillMetadata,
  toSkillMetadata,
} from "./skill.ts";

export { validateSkillMetadata, type ValidationResult } from "./validator.ts";

export { escapeHtml, toPrompt } from "./prompt.ts";
