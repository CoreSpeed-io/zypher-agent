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
  parseSkill,
  type Skill,
  type SkillMetadata,
  toSkillMetadata,
} from "./skill.ts";

export {
  type DiscoverOptions,
  discoverSkills,
  findSkillMd,
} from "./discover.ts";

export { validateSkillMetadata, type ValidationResult } from "./validator.ts";

export { escapeHtml, toPrompt } from "./prompt.ts";
