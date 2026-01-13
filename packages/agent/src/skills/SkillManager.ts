import { join, relative, resolve } from "@std/path";
import { exists } from "@std/fs";
import type { Skill, SkillMetadata } from "./Skill.ts";
import { validateSkillMetadata } from "./Skill.ts";
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
 * Escapes HTML special characters for safe XML output
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

        const skillPath = join(skillsDir, entry.name);
        const skillMdPath = join(skillPath, "SKILL.md");

        if (!(await exists(skillMdPath))) {
          // Also check for lowercase skill.md
          const skillMdPathLower = join(skillPath, "skill.md");
          if (!(await exists(skillMdPathLower))) {
            console.warn(
              `Skill directory ${entry.name} does not contain SKILL.md, skipping`,
            );
            continue;
          }
        }

        // Parse Skill metadata
        try {
          const skill = await this.#loadSkillMetadata(
            skillPath,
            skillMdPath,
            source,
          );
          if (skill) {
            // Check for duplicate names (project skills override global)
            if (this.#skills.has(skill.metadata.name)) {
              const existing = this.#skills.get(skill.metadata.name)!;
              // Project skills take precedence over global
              if (source === "project") {
                this.#skills.set(skill.metadata.name, skill);
              } else {
                console.warn(
                  `Skill "${skill.metadata.name}" already exists from ${existing.skillPath}, skipping duplicate from ${skillPath}`,
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
   * Loads Skill metadata from SKILL.md
   */
  async #loadSkillMetadata(
    skillPath: string,
    skillMdPath: string,
    source: "global" | "project" | "custom",
  ): Promise<Skill | null> {
    // Check for uppercase first, then lowercase
    let actualPath = skillMdPath;
    if (!(await exists(skillMdPath))) {
      const lowerPath = join(skillPath, "skill.md");
      if (await exists(lowerPath)) {
        actualPath = lowerPath;
      } else {
        return null;
      }
    }

    const content = await Deno.readTextFile(actualPath);
    const metadata = this.#parseFrontmatter(content);

    if (!metadata) {
      console.warn(`Failed to parse frontmatter from ${actualPath}`);
      return null;
    }

    const validation = validateSkillMetadata(metadata);
    if (!validation.valid) {
      console.warn(
        `Invalid Skill metadata in ${actualPath}: ${
          validation.errors.join(", ")
        }`,
      );
      return null;
    }

    // Determine location path based on source
    let location: string;
    if (source === "project") {
      // Use relative path for project skills
      location = relative(this.#context.workingDirectory, actualPath);
    } else {
      // Use absolute path for global and custom skills
      location = actualPath;
    }

    return {
      metadata,
      skillPath,
      skillMdPath: actualPath,
      location,
    };
  }

  /**
   * Parses YAML frontmatter from SKILL.md
   */
  #parseFrontmatter(content: string): SkillMetadata | null {
    // Try to match YAML frontmatter
    const frontmatter = content.match(
      /^---\s*\n([\s\S]*?)\n---/,
    );

    if (!frontmatter) {
      return null;
    }

    const frontmatterText = frontmatter[1];

    // Extract required fields
    const nameMatch = frontmatterText.match(/^name:\s*(.+?)$/m);
    const descriptionMatch = frontmatterText.match(/^description:\s*(.+?)$/m);

    if (!nameMatch || !descriptionMatch) {
      return null;
    }

    const name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
    const description = descriptionMatch[1].trim().replace(
      /^["']|["']$/g,
      "",
    );

    // Extract optional fields
    const licenseMatch = frontmatterText.match(/^license:\s*(.+?)$/m);
    const compatibilityMatch = frontmatterText.match(
      /^compatibility:\s*(.+?)$/m,
    );
    const allowedToolsMatch = frontmatterText.match(
      /^allowed-tools:\s*(.+?)$/m,
    );

    const metadata: SkillMetadata = { name, description };

    if (licenseMatch) {
      metadata.license = licenseMatch[1].trim().replace(/^["']|["']$/g, "");
    }
    if (compatibilityMatch) {
      metadata.compatibility = compatibilityMatch[1].trim().replace(
        /^["']|["']$/g,
        "",
      );
    }
    if (allowedToolsMatch) {
      metadata.allowedTools = allowedToolsMatch[1].trim().replace(
        /^["']|["']$/g,
        "",
      );
    }

    // Parse nested metadata block (simplified - only single-line key-value pairs)
    const metadataBlockMatch = frontmatterText.match(
      /^metadata:\s*\n((?:\s+\S+:\s*.+\n?)*)/m,
    );
    if (metadataBlockMatch) {
      const metadataBlock = metadataBlockMatch[1];
      const keyValuePairs = metadataBlock.matchAll(/^\s+(\S+):\s*(.+?)$/gm);
      metadata.metadata = {};
      for (const match of keyValuePairs) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, "");
        metadata.metadata[key] = value;
      }
    }

    return metadata;
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
   * Follows the agentskills reference format.
   */
  getSkillsMetadataForPrompt(): string {
    const skills = this.getAllSkills();

    if (skills.length === 0) {
      return "<available_skills>\n</available_skills>";
    }

    const skillsXml = skills.map((skill) => {
      const name = escapeHtml(skill.metadata.name);
      const desc = escapeHtml(skill.metadata.description);
      const location = escapeHtml(skill.location);
      return `<skill>
<name>${name}</name>
<description>${desc}</description>
<location>${location}</location>
</skill>`;
    }).join("\n");

    return `<available_skills>
${skillsXml}
</available_skills>`;
  }
}
