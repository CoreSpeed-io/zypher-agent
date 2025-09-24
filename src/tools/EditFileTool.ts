import { z } from "zod";
import {
  createTool,
  type Tool,
  type ToolExecutionContext,
  type ToolResult,
} from "./mod.ts";
import { applyPatch } from "diff";
import { fileExists } from "../utils/data.ts";
import { basename, dirname, join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";

/**
 * Create file editing tools with an optional backup directory
 *
 * @param backupDir - The directory where file backups will be stored before edits are applied.
 *  Defaults to ./backup if not provided.
 * @returns An object containing the configured file editing tool
 */
export function createEditFileTool(backupDir: string = "./backup"): {
  EditFileTool: Tool<{
    targetFile: string;
    explanation: string;
    action:
      | { type: "overwrite"; content: string }
      | { type: "insert"; content: string; line: number }
      | {
        type: "replace_str";
        oldContent: string;
        newContent: string;
        replaceAll?: boolean;
      }
      | {
        type: "replace_regex";
        pattern: string;
        replacement: string;
        flags?: string;
      }
      | { type: "patch"; diff: string };
  }>;
  UndoFileTool: Tool<{
    targetFile: string;
    explanation: string;
  }>;
} {
  const EditFileTool = createTool({
    name: "edit_file",
    description:
      "Edit a text file using various actions like overwrite, insert, replace, or patch.",
    schema: z.object({
      targetFile: z.string().describe("The target file to edit"),
      explanation: z.string().describe(
        "One sentence explanation of the intended change",
      ),
      action: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("overwrite").describe("Replace entire file content"),
          content: z.string().describe("The complete new file content"),
        }),
        z.object({
          type: z.literal("insert").describe("Insert content at specific line"),
          content: z.string().describe("The content to insert"),
          line: z.number().min(1).describe(
            "1-based line number to insert content BEFORE",
          ),
        }),
        z.object({
          type: z.literal("replace_str").describe("Replace string occurrences"),
          oldContent: z.string().describe(
            "The exact string to find and replace",
          ),
          newContent: z.string().describe("The replacement string"),
          replaceAll: z.boolean().optional().default(false).describe(
            "Replace all occurrences instead of just the first",
          ),
        }),
        z.object({
          type: z.literal("replace_regex").describe(
            "Replace using regular expression",
          ),
          pattern: z.string().describe("The regular expression pattern"),
          replacement: z.string().describe(
            "The replacement string (can include capture groups)",
          ),
          flags: z.string().optional().default("g").describe(
            "RegExp flags (e.g. 'g', 'i')",
          ),
        }),
        z.object({
          type: z.literal("patch").describe("Apply unified diff patch"),
          diff: z.string().describe("The unified diff string to apply"),
        }),
      ]),
    }),

    execute: async (
      params,
      ctx: ToolExecutionContext,
    ): Promise<ToolResult> => {
      const target = resolve(ctx.workingDirectory, params.targetFile);

      const resolvedBackupDir = resolve(ctx.workingDirectory, backupDir);
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
      const backupResolvedDir = resolve(ctx.workingDirectory, backupDir);

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

  return { EditFileTool, UndoFileTool };
}
