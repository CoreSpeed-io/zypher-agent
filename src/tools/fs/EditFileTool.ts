import { z } from "zod";
import {
  createTool,
  type Tool,
  type ToolExecutionContext,
  type ToolResult,
} from "../mod.ts";
import { applyPatch } from "diff";
import { fileExists } from "../../utils/data.ts";
import { basename, dirname, join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";

/**
 * Create file editing tools with an optional backup directory
 *
 * @param backupDir - The directory where file backups will be stored before edits are applied.
 *  If not provided, defaults to {workspaceDataDir}/backup.
 *  If a relative path is provided, it will be resolved relative to the working directory.
 * @returns An array of edit tools (EditFileTool, UndoFileTool)
 */
export function createEditFileTools(backupDir?: string): Tool[] {
  const EditFileTool = createTool({
    name: "edit_file",
    description:
      `Edit a text file using one of five action types. The 'action' parameter is a discriminated union - a JSON object where the 'type' field determines which other fields are required.

Available action types:
1. 'overwrite' - Replace entire file content OR create a new file. Structure: {type: "overwrite", content: "..."}
2. 'insert' - Insert content at a specific line number (1-based). Structure: {type: "insert", content: "...", line: 1}
3. 'replace_str' - Replace exact string matches. Structure: {type: "replace_str", oldContent: "...", newContent: "...", replaceAll: false}
4. 'replace_regex' - Replace using regular expressions. Structure: {type: "replace_regex", pattern: "...", replacement: "...", flags: "g"}
5. 'patch' - Apply a unified diff patch. Structure: {type: "patch", diff: "..."}`,
    schema: z.object({
      targetFile: z.string().describe("The target file to edit"),
      explanation: z.string().describe(
        "One sentence explanation of the intended change",
      ),
      action: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("overwrite").describe(
            "Action type for replacing entire file content or creating a new file",
          ),
          content: z.string().describe(
            "The complete new file content to write",
          ),
        }),
        z.object({
          type: z.literal("insert").describe(
            "Action type for inserting content at a specific line",
          ),
          content: z.string().describe("The content to insert"),
          line: z.number().int().min(1).describe(
            "1-based line number where content will be inserted BEFORE this line (e.g., line=1 inserts at the beginning)",
          ),
        }),
        z.object({
          type: z.literal("replace_str").describe(
            "Action type for replacing exact string matches",
          ),
          oldContent: z.string().describe(
            "The exact string to search for and replace (must match exactly)",
          ),
          newContent: z.string().describe("The replacement string"),
          replaceAll: z.boolean().default(false).describe(
            "If true, replace all occurrences; if false, replace only the first occurrence",
          ),
        }),
        z.object({
          type: z.literal("replace_regex").describe(
            "Action type for replacing using regular expression pattern matching",
          ),
          pattern: z.string().describe(
            "The regular expression pattern to match (without surrounding slashes)",
          ),
          replacement: z.string().describe(
            "The replacement string (can include capture groups like $1, $2)",
          ),
          flags: z.string().default("g").describe(
            "RegExp flags (e.g., 'g' for global, 'i' for case-insensitive, 'gi' for both)",
          ),
        }),
        z.object({
          type: z.literal("patch").describe(
            "Action type for applying a unified diff patch",
          ),
          diff: z.string().describe(
            "The unified diff string to apply (standard patch format)",
          ),
        }),
      ]),
    }),

    execute: async (
      params,
      ctx: ToolExecutionContext,
    ): Promise<ToolResult> => {
      const target = resolve(ctx.workingDirectory, params.targetFile);

      // Use provided backupDir (resolved relative to workingDirectory) or default to workspaceDataDir/backup
      const resolvedBackupDir = backupDir
        ? resolve(ctx.workingDirectory, backupDir)
        : join(ctx.workspaceDataDir, "backup");
      await ensureDir(resolvedBackupDir);

      // Check if file exists and create backup if needed
      if (await fileExists(target)) {
        const fileName = basename(target);
        // Backup original file
        await Deno.copyFile(
          target,
          join(resolvedBackupDir, `${fileName}.bak`),
        );
      } else if (params.action.type !== "overwrite") {
        throw new Error(
          `Target file ${target} does not exist, required for action ${params.action.type}.`,
        );
      }

      switch (params.action.type) {
        case "overwrite": {
          const parent = dirname(target);
          if (parent) await ensureDir(parent);

          await Deno.writeTextFile(target, params.action.content);
          return "File overwritten successfully";
        }

        case "insert": {
          if (params.action.line < 1) {
            throw new Error(
              `Invalid line value: ${params.action.line}. Must be greater than 0.`,
            );
          }

          const original = await Deno.readTextFile(target);
          const originalLines = original.split("\n");
          const insertedLines = params.action.content.split("\n");

          // convert 1-based line number to 0-based index
          const insertAt = params.action.line - 1;
          originalLines.splice(insertAt, 0, ...insertedLines);
          const output = originalLines.join("\n");

          await Deno.writeTextFile(target, output);
          return `Inserted ${insertedLines.length} lines.`;
        }

        case "replace_str": {
          const original = await Deno.readTextFile(target);
          const output = params.action.replaceAll
            ? original.replaceAll(
              params.action.oldContent,
              params.action.newContent,
            )
            : original.replace(
              params.action.oldContent,
              params.action.newContent,
            );

          const occurrences = original.split(params.action.oldContent).length -
            1;

          if (occurrences > 0) {
            await Deno.writeTextFile(target, output);
            return `Replaced ${occurrences} occurrences`;
          } else {
            return "No occurrences found to replace";
          }
        }

        case "replace_regex": {
          const original = await Deno.readTextFile(target);
          const regex = new RegExp(
            params.action.pattern,
            params.action.flags,
          );
          const matches = original.match(regex);

          if (matches) {
            const output = original.replace(regex, params.action.replacement);
            await Deno.writeTextFile(target, output);
            return `Replaced ${matches.length} regex matches`;
          } else {
            return "No matches found for the regex pattern";
          }
        }

        case "patch": {
          const original = await Deno.readTextFile(target);
          const patched = applyPatch(original, params.action.diff);
          if (patched === false) {
            throw new Error("Incompatible patch");
          }

          await Deno.writeTextFile(target, patched);
          return "File patched successfully";
        }
      }
    },
  });

  const UndoFileTool = createTool({
    name: "undo_file",
    description: "Restore a file from its backup.",
    schema: z.object({
      targetFile: z.string().describe("The target file to restore from backup"),
      explanation: z.string().describe(
        "One sentence explanation of why you're undoing",
      ),
    }),

    execute: async (params, ctx: ToolExecutionContext): Promise<ToolResult> => {
      const targetResolved = resolve(ctx.workingDirectory, params.targetFile);
      // Use provided backupDir (resolved relative to workingDirectory) or default to workspaceDataDir/backup
      const backupResolvedDir = backupDir
        ? resolve(ctx.workingDirectory, backupDir)
        : join(ctx.workspaceDataDir, "backup");

      const fileName = basename(targetResolved);

      // const backupFile = `${backupDir}/${fileName}.bak`;
      const backupFile = join(backupResolvedDir, `${fileName}.bak`);
      const backupExists = await fileExists(backupFile);
      if (backupExists) {
        await Deno.copyFile(backupFile, targetResolved);
      } else {
        throw new Error("No backup file exists");
      }

      return "Successfully restored file from backup";
    },
  });

  return [EditFileTool, UndoFileTool];
}
