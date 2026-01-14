import { join, relative, resolve } from "@std/path";
import { discoverSkills, type Skill, toPrompt } from "@zypher/skills";
import type { ZypherContext } from "./ZypherAgent.ts";

/**
 * Configuration options for SkillManager
 */
export interface SkillManagerOptions {
  /** Global skills directory (default: ~/.zypher/skills) */
  globalSkillsDir?: string;
  /** Project skills directory relative to workingDirectory (default: .skills) */
  projectSkillsDir?: string;
  /** Additional custom skill directories (absolute paths) */
  customSkillsDirs?: string[];
}

/**
 * Manages Agent Skills discovery and loading from multiple directories
 */
export class SkillManager {
  readonly #context: ZypherContext;
  readonly #globalSkillsDir: string;
  readonly #projectSkillsDir: string;
  readonly #customSkillsDirs: string[];
  #skills: Map<string, Skill> = new Map();

  constructor(
    context: ZypherContext,
    options?: SkillManagerOptions,
  ) {
    this.#context = context;

    // Global skills: ~/.zypher/skills
    this.#globalSkillsDir = options?.globalSkillsDir ??
      join(context.zypherDir, "skills");

    // Project skills: ./.skills in working directory
    this.#projectSkillsDir = resolve(
      context.workingDirectory,
      options?.projectSkillsDir ?? ".skills",
    );

    // Custom directories (absolute paths)
    this.#customSkillsDirs = options?.customSkillsDirs ?? [];
  }

  /**
   * Gets the global skills directory path
   */
  get globalSkillsDir(): string {
    return this.#globalSkillsDir;
  }

  /**
   * Gets the project skills directory path
   */
  get projectSkillsDir(): string {
    return this.#projectSkillsDir;
  }

  /**
   * Discovers all Skills from all configured directories
   */
  async discover(): Promise<void> {
    this.#skills.clear();

    // Discover from global skills directory
    await this.#discoverFromDirectory(this.#globalSkillsDir, "global");

    // Discover from project skills directory
    await this.#discoverFromDirectory(this.#projectSkillsDir, "project");

    // Discover from custom directories
    for (const customDir of this.#customSkillsDirs) {
      await this.#discoverFromDirectory(customDir, "custom");
    }
  }

  /**
   * Discovers skills from a specific directory using @zypher/skills
   */
  async #discoverFromDirectory(
    skillsDir: string,
    source: "global" | "project" | "custom",
  ): Promise<void> {
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
      // Check for duplicate names (project skills override global)
      if (this.#skills.has(skill.metadata.name)) {
        const existing = this.#skills.get(skill.metadata.name)!;
        // Project skills take precedence over global
        if (source === "project") {
          // Adjust location for project skills to be relative
          const adjustedSkill = this.#adjustLocation(skill, source);
          this.#skills.set(skill.metadata.name, adjustedSkill);
        } else {
          console.warn(
            `Skill "${skill.metadata.name}" already exists at ${existing.location}, skipping duplicate from ${skill.location}`,
          );
        }
      } else {
        // Adjust location based on source
        const adjustedSkill = this.#adjustLocation(skill, source);
        this.#skills.set(skill.metadata.name, adjustedSkill);
      }
    }
  }

  /**
   * Adjusts skill location based on source type
   * Project skills get relative paths, others get absolute
   */
  #adjustLocation(
    skill: Skill,
    source: "global" | "project" | "custom",
  ): Skill {
    if (source === "project") {
      return {
        ...skill,
        location: relative(this.#context.workingDirectory, skill.location),
      };
    }
    return skill;
  }

  /**
   * Gets all discovered Skills
   */
  getAllSkills(): Skill[] {
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
  getSkillsMetadataForPrompt(): string {
    return toPrompt(this.getAllSkills());
  }
}
