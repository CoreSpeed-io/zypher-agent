import { z } from "zod";
import {
  createTool,
  type Tool,
  type ToolExecutionContext,
  type ToolResult,
} from "../mod.ts";
import { basename, dirname, join } from "@std/path";

/**
 * Create file editing tools with an optional backup directory
 *
 * @param backupDir - The directory where file backups will be stored before edits are applied.
 *  If not provided, defaults to {workspaceDataDir}/backup.
 *  If a relative path is provided, it will be resolved relative to the working directory.
 * @returns An array of edit tools (EditFileTool, UndoFileTool)
 */
export function createEditFileTools(backupDir?: string): Tool[] {
  /**
   * Field usage by action type:
   * | type          | content (required)   | oldContent       | line     | replaceAll | flags    |
   * |---------------|----------------------|------------------|----------|------------|----------|
   * | overwrite     | new file content     | -                | -        | -          | -        |
   * | insert        | text to insert       | -                | required | -          | -        |
   * | replace_str   | replacement text     | string to find   | -        | optional   | -        |
   * | replace_regex | replacement text     | regex pattern    | -        | -          | optional |
   */
  const EditFileTool = createTool({
    name: "edit_file",
    description:
      `Edit a text file. The 'type' field determines which other fields are required.

Action types:
- 'overwrite': Replace entire file or create new file. Requires: content
- 'insert': Insert content before the specified line (line=1 inserts at start). Requires: content, line
- 'replace_str': Replace exact string match. Requires: oldContent, content. Optional: replaceAll
- 'replace_regex': Replace regex match. Requires: oldContent (pattern), content (replacement). Optional: flags`,
    schema: z.object({
      targetFile: z.string().describe("The target file to edit"),
      explanation: z.string().describe(
        "One sentence explanation of the intended change",
      ),
      type: z.enum(["overwrite", "insert", "replace_str", "replace_regex"])
        .describe("The type of edit action"),
      content: z.string().describe(
        "New content: full file (overwrite), text to insert (insert), replacement text (replace_str/replace_regex)",
      ),
      oldContent: z.string().optional().describe(
        "Content to find: exact string (replace_str) or regex pattern (replace_regex)",
      ),
      line: z.number().int().min(1).optional().describe(
        "1-based line number where content will be inserted BEFORE this line (insert only)",
      ),
      replaceAll: z.boolean().optional().describe(
        "Replace all occurrences instead of just the first (replace_str only)",
      ),
      flags: z.string().optional().describe(
        "Regex flags like 'g', 'i', 'gi' (replace_regex only, defaults to 'g')",
      ),
    }),

    execute: async (
      params,
      ctx: ToolExecutionContext,
    ): Promise<ToolResult> => {
      const adapter = ctx.fileSystemAdapter;

      // Use provided backupDir or default to workspaceDataDir/backup
      const resolvedBackupDir = backupDir ?? join(adapter.workspaceDataDir, "backup");
      await adapter.ensureDir(resolvedBackupDir);

      // Check if file exists and create backup if needed
      if (await adapter.exists(params.targetFile)) {
        const fileName = basename(params.targetFile);
        // Backup original file
        await adapter.copyFile(
          params.targetFile,
          join(resolvedBackupDir, `${fileName}.bak`),
        );
      } else if (params.type !== "overwrite") {
        throw new Error(
          `Target file ${params.targetFile} does not exist, required for action ${params.type}.`,
        );
      }

      switch (params.type) {
        case "overwrite": {
          const parent = dirname(params.targetFile);
          if (parent) await adapter.ensureDir(parent);

          await adapter.writeTextFile(params.targetFile, params.content);
          return "File overwritten successfully";
        }

        case "insert": {
          if (params.line === undefined) {
            throw new Error("'line' is required for insert action");
          }

          const original = await adapter.readTextFile(params.targetFile);
          const originalLines = original.split("\n");
          const insertedLines = params.content.split("\n");

          // convert 1-based line number to 0-based index
          const insertAt = params.line - 1;
          originalLines.splice(insertAt, 0, ...insertedLines);
          const output = originalLines.join("\n");

          await adapter.writeTextFile(params.targetFile, output);
          return `Inserted ${insertedLines.length} lines.`;
        }

        case "replace_str": {
          if (!params.oldContent) {
            throw new Error(
              "'oldContent' (string to find) is required for replace_str action",
            );
          }

          const original = await adapter.readTextFile(params.targetFile);
          const output = params.replaceAll
            ? original.replaceAll(params.oldContent, params.content)
            : original.replace(params.oldContent, params.content);

          const occurrences = original.split(params.oldContent).length - 1;

          if (occurrences > 0) {
            await adapter.writeTextFile(params.targetFile, output);
            return `Replaced ${occurrences} occurrences`;
          } else {
            return "No occurrences found to replace";
          }
        }

        case "replace_regex": {
          if (!params.oldContent) {
            throw new Error(
              "'oldContent' (regex pattern) is required for replace_regex action",
            );
          }

          const original = await adapter.readTextFile(params.targetFile);
          const regex = new RegExp(params.oldContent, params.flags ?? "g");
          const matches = original.match(regex);

          if (matches) {
            const output = original.replace(regex, params.content);
            await adapter.writeTextFile(params.targetFile, output);
            return `Replaced ${matches.length} regex matches`;
          } else {
            return "No matches found for the regex pattern";
          }
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
      const adapter = ctx.fileSystemAdapter;
      // Use provided backupDir or default to workspaceDataDir/backup
      const backupResolvedDir = backupDir ?? join(adapter.workspaceDataDir, "backup");

      const fileName = basename(params.targetFile);
      const backupFile = join(backupResolvedDir, `${fileName}.bak`);

      if (await adapter.exists(backupFile)) {
        await adapter.copyFile(backupFile, params.targetFile);
      } else {
        throw new Error("No backup file exists");
      }

      return "Successfully restored file from backup";
    },
  });

  return [EditFileTool, UndoFileTool];
}
