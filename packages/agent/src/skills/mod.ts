/**
 * Skills module - re-exports from @zypher/skills and provides SkillManager.
 * @module
 */

// Re-export types and functions from @zypher/skills
export type {
  DiscoverOptions,
  RawFrontmatter,
  Skill,
  SkillMetadata,
  ValidationResult,
} from "@zypher/skills";

export {
  discoverSkills,
  escapeHtml,
  findSkillMd,
  parseFrontmatter,
  readSkill,
  toPrompt,
  toSkillMetadata,
  validateSkillDir,
  validateSkillMetadata,
} from "@zypher/skills";

// Export SkillManager and options
export { SkillManager, type SkillManagerOptions } from "./SkillManager.ts";
