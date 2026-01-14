import { relative, resolve } from "@std/path";
import { discoverSkills, type Skill, toPrompt } from "@zypher/skills";
import type { ZypherContext } from "./ZypherAgent.ts";

/**
 * Configuration options for SkillManager
 */
export interface SkillManagerOptions {
  /** Project skills directory relative to workingDirectory (default: .skills) */
  projectSkillsDir?: string;
  /** Additional custom skill directories (resolved relative to workingDirectory if not absolute) */
  customSkillsDirs?: string[];
}

/**
 * Manages Agent Skills discovery and loading from multiple directories.
 *
 * Skills are discovered from three sources with the following precedence (highest first):
 * 1. **Custom**: Additional directories specified via `customSkillsDirs` option
 * 2. **Project** (`.skills/` in working directory): Project-specific skills
 * 3. **Global** (`~/.zypher/skills/`): User-wide skills available to all projects
 *
 * Higher precedence sources override lower ones when skill names conflict.
 * Within the same precedence level, first occurrence wins.
 *
 * **Location paths in skill metadata:**
 * - Skills inside the working directory use relative paths (e.g., `.skills/my-skill/SKILL.md`)
 * - Skills outside the working directory use absolute paths
 */
export class SkillManager {
  readonly #context: ZypherContext;
  readonly #projectSkillsDir: string;
  readonly #customSkillsDirs: string[];
  readonly #skills: Map<string, Skill> = new Map();

  constructor(
    context: ZypherContext,
    options?: SkillManagerOptions,
  ) {
    this.#context = context;

    // Project skills: ./.skills in working directory
    this.#projectSkillsDir = resolve(
      context.workingDirectory,
      options?.projectSkillsDir ?? ".skills",
    );

    // Custom directories (resolved relative to workingDirectory)
    this.#customSkillsDirs = (options?.customSkillsDirs ?? []).map((dir) =>
      resolve(context.workingDirectory, dir)
    );
  }

  /**
   * Gets the global skills directory path
   */
  get globalSkillsDir(): string {
    return this.#context.skillsDir;
  }

  /**
   * Gets the project skills directory path
   */
  get projectSkillsDir(): string {
    return this.#projectSkillsDir;
  }

  /**
   * Discovers all Skills from all configured directories.
   *
   * Discovery processes lowest precedence first, allowing higher precedence
   * sources to override. See class documentation for precedence rules.
   */
  async discover(): Promise<void> {
    this.#skills.clear();

    // Process in order of increasing precedence (later sources override earlier)
    // 1. Global skills (lowest precedence)
    await this.#discoverFromDirectory(this.#context.skillsDir);

    // 2. Project skills (override global)
    await this.#discoverFromDirectory(this.#projectSkillsDir);

    // 3. Custom directories (highest precedence, override all)
    for (const customDir of this.#customSkillsDirs) {
      await this.#discoverFromDirectory(customDir);
    }
  }

  /**
   * Discovers skills from a specific directory using @zypher/skills.
   * Later calls override earlier ones for duplicate skill names.
   */
  async #discoverFromDirectory(skillsDir: string): Promise<void> {
    const skills = await discoverSkills(skillsDir, {
      onMissingSkillMd: (dirName: string) => {
        console.warn(
          `Skill directory ${dirName} does not contain SKILL.md, skipping`,
        );
      },
      onLoadError: (dirName: string, error: Error) => {
        console.warn(`Failed to load Skill ${dirName}: ${error.message}`);
      },
      onInvalidMetadata: (path: string, errors: string[]) => {
        console.warn(`Invalid Skill metadata in ${path}: ${errors.join(", ")}`);
      },
    });

    for (const skill of skills) {
      const adjustedSkill = this.#adjustLocation(skill);
      this.#skills.set(skill.metadata.name, adjustedSkill);
    }
  }

  /**
   * Adjusts skill location to use relative path if inside working directory.
   * Skills outside working directory keep absolute paths.
   */
  #adjustLocation(skill: Skill): Skill {
    const workDir = this.#context.workingDirectory;
    const relativePath = relative(workDir, skill.location);
    // If relative path doesn't start with "..", the skill is inside workDir
    if (!relativePath.startsWith("..")) {
      return {
        ...skill,
        location: relativePath,
      };
    }
    return skill;
  }

  /**
   * Gets all discovered Skills
   */
  get skills(): Skill[] {
    return Array.from(this.#skills.values());
  }

  /**
   * Gets a specific Skill by name
   */
  getSkill(name: string): Skill | undefined {
    return this.#skills.get(name);
  }

  /**
   * Gets Skill metadata formatted as XML for system prompt inclusion.
   * Uses the toPrompt function from @zypher/skills package.
   */
  get skillsPrompt(): string {
    return toPrompt(this.skills);
  }
}
