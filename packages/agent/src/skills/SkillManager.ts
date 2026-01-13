import { join, relative, resolve } from "@std/path";
import { exists } from "@std/fs";
import {
  findSkillMd,
  parseFrontmatter,
  type Skill,
  toPrompt,
  toSkillMetadata,
  validateSkillMetadata,
} from "@zypher/skills";
import type { ZypherContext } from "../ZypherAgent.ts";

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
  async discoverSkills(): Promise<void> {
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
   * Discovers skills from a specific directory
   */
  async #discoverFromDirectory(
    skillsDir: string,
    source: "global" | "project" | "custom",
  ): Promise<void> {
    if (!(await exists(skillsDir))) {
      return;
    }

    try {
      for await (const entry of Deno.readDir(skillsDir)) {
        if (!entry.isDirectory) {
          continue;
        }

        const skillDir = join(skillsDir, entry.name);

        // Use findSkillMd from @zypher/skills
        const skillMdPath = await findSkillMd(skillDir);
        if (!skillMdPath) {
          console.warn(
            `Skill directory ${entry.name} does not contain SKILL.md, skipping`,
          );
          continue;
        }

        // Parse Skill metadata
        try {
          const skill = await this.#loadSkill(skillMdPath, source);
          if (skill) {
            // Check for duplicate names (project skills override global)
            if (this.#skills.has(skill.metadata.name)) {
              const existing = this.#skills.get(skill.metadata.name)!;
              // Project skills take precedence over global
              if (source === "project") {
                this.#skills.set(skill.metadata.name, skill);
              } else {
                console.warn(
                  `Skill "${skill.metadata.name}" already exists at ${existing.location}, skipping duplicate from ${skillMdPath}`,
                );
              }
            } else {
              this.#skills.set(skill.metadata.name, skill);
            }
          }
        } catch (error) {
          console.warn(
            `Failed to load Skill ${entry.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } catch (error) {
      console.warn(
        `Failed to discover Skills from ${skillsDir}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Loads Skill from SKILL.md file
   */
  async #loadSkill(
    skillMdPath: string,
    source: "global" | "project" | "custom",
  ): Promise<Skill | null> {
    const content = await Deno.readTextFile(skillMdPath);
    const raw = parseFrontmatter(content);

    if (!raw) {
      console.warn(`Failed to parse frontmatter from ${skillMdPath}`);
      return null;
    }

    const metadata = toSkillMetadata(raw);
    if (!metadata) {
      console.warn(`Missing required fields in ${skillMdPath}`);
      return null;
    }

    const validation = validateSkillMetadata(metadata);
    if (!validation.valid) {
      console.warn(
        `Invalid Skill metadata in ${skillMdPath}: ${
          validation.errors.join(", ")
        }`,
      );
      return null;
    }

    // Determine location path based on source
    const location = source === "project"
      ? relative(this.#context.workingDirectory, skillMdPath)
      : skillMdPath;

    return { metadata, location };
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
