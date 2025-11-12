import { z } from "zod";
import {
  createTool,
  type Tool,
  type ToolExecutionContext,
  type ToolResult,
} from "./mod.ts";
import type { SkillManager } from "../skills/mod.ts";

/**
 * Creates a tool that allows the Agent to load specific resources from a Skill
 *
 * @param skillManager The SkillManager instance to use for loading resources
 * @returns A tool that can load Skill resources
 */
export function createLoadSkillResourceTool(
  skillManager: SkillManager,
): Tool<{
  skillName: string;
  resourcePath: string;
  explanation?: string | undefined;
}> {
  return createTool({
    name: "load_skill_resource",
    description:
      `Load a specific resource file from an Agent Skill. Use this to access additional files referenced in Skill instructions, such as REFERENCE.md.

After loading a Skill's instructions, you may see a list of available resources. Use this tool to load specific resources when the Skill instructions reference them or when you need additional guidance.

The resourcePath should be relative to the Skill directory.`,
    schema: z.object({
      skillName: z
        .string()
        .describe(
          "The name of the Skill that contains the resource (must match exactly with the Skill name)",
        ),
      resourcePath: z
        .string()
        .describe(
          "The relative path to the resource within the Skill directory (e.g.'REFERENCE.md')",
        ),
      explanation: z
        .string()
        .optional()
        .describe(
          "One sentence explanation as to why you are loading this resource and how it will help with the task.",
        ),
    }),
    execute: async (
      { skillName, resourcePath },
      _ctx: ToolExecutionContext,
    ): Promise<ToolResult> => {
      // Check if Skill exists
      const skill = skillManager.getSkill(skillName);
      if (!skill) {
        return {
          content: [{
            type: "text",
            text: `Skill "${skillName}" not found. Available Skills: ${
              skillManager.getAllSkills().map((s) => s.metadata.name).join(", ")
            }`,
          }],
        };
      }

      // Ensure resources are discovered
      if (!skill.resourcesDiscovered) {
        await skillManager.discoverSkillResources(skillName);
      }

      // Load the resource
      const content = await skillManager.loadSkillResource(
        skillName,
        resourcePath,
      );

      if (content === null) {
        // List available resources for error message
        const resources = skillManager.getSkillResources(skillName);
        const availableResources = resources.length > 0
          ? resources.map((r) => r.relativePath).join(", ")
          : "none";

        return {
          content: [{
            type: "text",
            text:
              `Resource "${resourcePath}" not found in Skill "${skillName}".\n\nAvailable resources: ${availableResources}\n\nMake sure the resource path is relative to the Skill directory (e.g., "REFERENCE.md" not "/REFERENCE.md").`,
          }],
        };
      }

      // Return the resource content
      return {
        content: [{
          type: "text",
          text:
            `Loaded resource "${resourcePath}" from Skill "${skillName}":\n\n${content}`,
        }],
      };
    },
  });
}
