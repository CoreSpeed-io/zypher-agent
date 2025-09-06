import { z } from "zod";
import { defineTool, type Tool } from "./mod.ts";
import { applyPatch } from "diff";
import { fileExists } from "../utils/data.ts";
import { basename, dirname, isAbsolute, join } from "@std/path";
import { ensureDir } from "@std/fs";

enum EditFileAction {
  INSERT = "insert",
  REPLACE_REGEX = "replace_regex",
  REPLACE_STR_ALL = "replace_str_all",
  REPLACE_STR_FIRST = "replace_str_first",
  OVERWRITE = "overwrite",
  PATCH = "patch",
  CREATE = "create",
  UNDO = "undo",
}

async function statBytes(path: string): Promise<number> {
  try {
    const s = await Deno.stat(path);
    return s.size ?? 0;
  } catch {
    return 0;
  }
}

async function createFile(targetFile: string) {
  try {
    const parent = dirname(targetFile);
    if (parent) await ensureDir(parent);

    await Deno.create(targetFile);

    return JSON.stringify({
      ok: true,
      tool: "edit_file",
      targetFile,
      action: EditFileAction.CREATE,
      bytesBefore: 0,
      bytesAfter: 0,
      changed: true,
      details: { created: true },
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      tool: "edit_file",
      error: `Failed to create file: ${e instanceof Error ? e.message : e}`,
      data: { targetFile, action: EditFileAction.CREATE },
    });
  }
}

async function overwriteFile(
  targetFile: string,
  content: string,
  bytesBefore: number,
) {
  try {
    const parent = dirname(targetFile);
    if (parent) await ensureDir(parent);

    await Deno.writeTextFile(targetFile, content);
    const bytesAfter = await statBytes(targetFile);

    return JSON.stringify({
      ok: true,
      tool: "edit_file",
      targetFile,
      action: EditFileAction.OVERWRITE,
      bytesBefore,
      bytesAfter,
      changed: bytesBefore !== bytesAfter,
      details: { overwritten: true },
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      tool: "edit_file",
      error: `Failed to overwrite file: ${e instanceof Error ? e.message : e}`,
      data: { targetFile, action: EditFileAction.OVERWRITE },
    });
  }
}

async function insertFileAt(
  targetFile: string,
  content: string,
  insertAt: number,
  bytesBefore: number,
) {
  try {
    if (insertAt < 1) {
      return JSON.stringify({
        ok: false,
        tool: "edit_file",
        error: `Invalid insertAt value: ${insertAt}. Must be greater than 0.`,
        data: { targetFile, action: EditFileAction.INSERT, insertAt },
      });
    }
    const original = await Deno.readTextFile(targetFile);
    const lines = original.split("\n");
    const safeInsertAt = insertAt - 1;

    lines.splice(safeInsertAt, 0, ...content.split("\n"));
    const out = lines.join("\n");

    await Deno.writeTextFile(targetFile, out);
    const bytesAfter = await statBytes(targetFile);

    return JSON.stringify({
      ok: true,
      tool: "edit_file",
      targetFile,
      action: EditFileAction.INSERT,
      bytesBefore,
      bytesAfter,
      changed: out !== original,
      details: {
        insertAt: safeInsertAt,
        insertedLines: content.split("\n").length,
      },
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      tool: "edit_file",
      error: `Failed to insert file: ${e instanceof Error ? e.message : e}`,
      data: { targetFile, action: EditFileAction.INSERT },
    });
  }
}

async function replaceStringInFile(
  targetFile: string,
  matchString: string,
  replacement: string,
  replaceAll: boolean,
  bytesBefore: number,
) {
  const action = replaceAll
    ? EditFileAction.REPLACE_STR_ALL
    : EditFileAction.REPLACE_STR_FIRST;

  try {
    const original = await Deno.readTextFile(targetFile);
    const output = replaceAll
      ? original.replaceAll(matchString, replacement)
      : original.replace(matchString, replacement);

    const occurrences = original.split(matchString).length - 1;

    if (occurrences > 0) {
      await Deno.writeTextFile(targetFile, output);
    }

    const bytesAfter = await statBytes(targetFile);
    return JSON.stringify({
      ok: true,
      tool: "edit_file",
      targetFile,
      action,
      bytesBefore,
      bytesAfter,
      changed: occurrences > 0,
      details: {
        matchString,
        occurrences,
        replacement,
        replaced: occurrences > 0,
      },
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      tool: "edit_file",
      error: `Failed to replace string in file: ${
        e instanceof Error ? e.message : e
      }`,
      data: { targetFile, action },
    });
  }
}

async function replaceRegexInFile(
  targetFile: string,
  pattern: string, // oldContent
  reFlags: string,
  replacement: string, // newContent
  bytesBefore: number,
) {
  try {
    const original = await Deno.readTextFile(targetFile);
    const regex = new RegExp(pattern, reFlags);
    const matches = original.match(regex);

    if (matches) {
      const output = original.replace(regex, replacement);
      await Deno.writeTextFile(targetFile, output);
    }

    const bytesAfter = await statBytes(targetFile);
    return JSON.stringify({
      ok: true,
      tool: "edit_file",
      targetFile,
      action: EditFileAction.REPLACE_REGEX,
      bytesBefore,
      bytesAfter,
      changed: !!matches,
      details: {
        pattern,
        occurrences: matches ? matches.length : 0,
        replacement,
      },
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      tool: "edit_file",
      error: `Failed to replace regex in file: ${
        e instanceof Error ? e.message : e
      }`,
      data: { targetFile, action: EditFileAction.REPLACE_REGEX },
    });
  }
}

async function patchFile(
  targetFile: string,
  diff: string,
  bytesBefore: number,
) {
  try {
    const original = await Deno.readTextFile(targetFile);
    const patched = applyPatch(original, diff);
    if (patched === false) {
      throw new Error("Incompatible patch");
    }
    await Deno.writeTextFile(targetFile, patched);
    const bytesAfter = await statBytes(targetFile);
    return JSON.stringify({
      ok: true,
      tool: "edit_file",
      targetFile,
      action: EditFileAction.PATCH,
      bytesBefore,
      bytesAfter,
      changed: patched !== original,
      details: {
        diff,
      },
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      tool: "edit_file",
      error: `Failed to patch file: ${e instanceof Error ? e.message : e}`,
      data: { targetFile, action: EditFileAction.PATCH },
    });
  }
}

async function undoFile(targetFile: string, backupDir: string) {
  try {
    const fileName = basename(targetFile);

    const backupFile = `${backupDir}/${fileName}.bak`;
    const backupExists = await fileExists(backupFile);
    if (backupExists) {
      await Deno.copyFile(backupFile, targetFile);
    } else {
      throw new Error("No backup file exists");
    }

    return JSON.stringify({
      ok: true,
      tool: "edit_file",
      targetFile,
      action: EditFileAction.UNDO,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      tool: "edit_file",
      error: `Failed to undo changes in file: ${
        e instanceof Error ? e.message : e
      }`,
      data: { targetFile, action: EditFileAction.UNDO },
    });
  }
}

/**
 * Define a file editing tool with an optional backup directory
 *
 * @param backupDir - The directory where file backups will be stored before edits are applied. Defaults to ./backup if not provided.
 * @returns An object containing the configured file editing tool
 */
export function defineEditFileTool(backupDir: string = "./backup"): {
  EditFileTool: Tool<{
    targetFile: string;
    instructions: string;
    action: EditFileAction;
    newContent: string;
    insertAt?: number;
    oldContent?: string;
    reFlags?: string;
    walkpath?: string;
  }>;
} {
  const EditFileTool = defineTool({
    name: "edit_file",
    description: `Edit a text file using one of several actions.

Parameters:
- targetFile: The target file to edit.
- instructions: One sentence explanation of the intended change (for logging/audit).
- action: One of "create" | "insert" | "replace_regex" | "replace_str_first" | "replace_str_all" | "overwrite" | "patch" | "undo". Default "create".
- oldContent (optional):
  - For REPLACE_STR_*: the search string.
  - For REPLACE_REGEX: the regex *pattern* (JS RegExp source string).
- newContent: 
  - For OVERWRITE: the full new file content.
  - For INSERT: the text to insert.
  - For REPLACE_STR_*: the replacement text.
  - For REPLACE_REGEX: the replacement text or *pattern* (JS RegExp source string).
  - For PATCH: the unified diff string for PATCH.
- reFlags (optional): the RegExp flags (e.g. "g", "i") to use for REPLACE_REGEX, default is "g".
- insertAt (optional): 1-based line number to insert BEFORE (for "insert"). If > EOF, appends at end.

Behavior:
- Validates file existence before editing (except CREATE).
- Produces metadata about the change (bytes before/after, whether content changed).
- CREATE: creates an empty file.
- OVERWRITE: replaces the entire file content, creating a new file with the specified content if it doesn't exist.
- REPLACE_STR_FIRST: replaces the first occurrence; returns count (=0 or 1).
- REPLACE_STR_ALL: replaces all occurrences; returns total count.
- REPLACE_REGEX: replaces matches of the given pattern with \`content\`; returns match count, supports only JS RegExp.
- PATCH: applies unified diff using jsdiff; returns whether applied.
- UNDO: restores from last backup (.bak) if present.

Returns (JSON string) on success (fields vary by action):
{
  "ok": true,
  "tool": "edit_file",
  "data": {
    "targetFile": "<path>",
    "action": "<action>",
    "bytesBefore": <n>,
    "bytesAfter": <n>,
    "changed": true,
    "details": { ...actionSpecific }
  }
}

On error:
{
  "ok": false,
  "tool": "edit_file",
  "error": "Error message",
  "data": {
    "targetFile": "<path>",
    "action": "<action>"
  }
}`,
    parameters: z.object({
      targetFile: z
        .string()
        .describe("The target file to edit"),
      instructions: z
        .string()
        .describe("Instructions for the edit"),
      action: z
        .nativeEnum(EditFileAction)
        .describe("The action to perform")
        .default(EditFileAction.CREATE),
      oldContent: z
        .string()
        .optional()
        .describe("Old content to be replaced"),
      newContent: z
        .string()
        .describe("The new content for the file"),
      reFlags: z
        .string()
        .optional()
        .default("g")
        .describe(
          `The RegExp flags (e.g. 'g', 'i') to use for REPLACE_REGEX, default is 'g'`,
        ),
      insertAt: z
        .number()
        .min(1)
        .optional()
        .describe(
          "1-based line number to insert BEFORE (for insert)",
        ),
      walkpath: z
        .string()
        .optional()
        .describe("Walk workspace path to resolve targetFile/backupDir from"),
    }),

    execute: async ({
      targetFile,
      action,
      oldContent,
      newContent,
      reFlags,
      insertAt,
      walkpath,
    }): Promise<string> => {
      const resolve = (
        p: string,
      ) => (isAbsolute(p) ? p : join(walkpath ?? Deno.cwd(), p));
      const targetResolved = resolve(targetFile);
      const backupResolvedDir = resolve(backupDir);
      await ensureDir(backupResolvedDir);
      const fileName = basename(targetResolved);
      try {
        await Deno.stat(targetResolved);
        if (action === EditFileAction.CREATE) {
          return JSON.stringify({
            ok: false,
            tool: "edit_file",
            error: `${targetResolved} already exists`,
            data: { targetFile: targetResolved, action: EditFileAction.CREATE },
          });
        }
        // Backup original file
        if (action !== EditFileAction.UNDO) {
          await Deno.copyFile(
            targetResolved,
            `${backupResolvedDir}/${fileName}.bak`,
          );
        }
      } catch {
        if (
          action !== EditFileAction.CREATE &&
          action !== EditFileAction.OVERWRITE
        ) {
          return JSON.stringify({
            ok: false,
            tool: "edit_file",
            error: `${targetResolved} does not exist`,
            data: { targetFile: targetResolved, action },
          });
        }
      }

      try {
        const bytesBefore = await statBytes(targetResolved);

        switch (action) {
          case EditFileAction.CREATE: {
            return await createFile(targetResolved);
          }
          case EditFileAction.OVERWRITE: {
            return await overwriteFile(targetResolved, newContent, bytesBefore);
          }

          case EditFileAction.INSERT: {
            if (!insertAt) {
              return JSON.stringify({
                ok: false,
                tool: "edit_file",
                error: "'insertAt' is required for INSERT",
                data: {
                  targetFile: targetResolved,
                  action: EditFileAction.INSERT,
                },
              });
            }

            return await insertFileAt(
              targetResolved,
              newContent,
              insertAt,
              bytesBefore,
            );
          }

          case EditFileAction.REPLACE_STR_FIRST: {
            if (!oldContent) {
              return JSON.stringify({
                ok: false,
                tool: "edit_file",
                error: "'oldContent' is required for REPLACE_STR_FIRST",
                data: {
                  targetFile: targetResolved,
                  action: EditFileAction.REPLACE_STR_FIRST,
                },
              });
            }
            return await replaceStringInFile(
              targetResolved,
              oldContent,
              newContent,
              false,
              bytesBefore,
            );
          }

          case EditFileAction.REPLACE_STR_ALL: {
            if (!oldContent) {
              return JSON.stringify({
                ok: false,
                tool: "edit_file",
                error: "'oldContent' is required for REPLACE_STR_ALL",
                data: {
                  targetFile: targetResolved,
                  action: EditFileAction.REPLACE_STR_ALL,
                },
              });
            }
            return await replaceStringInFile(
              targetResolved,
              oldContent,
              newContent,
              true,
              bytesBefore,
            );
          }

          case EditFileAction.REPLACE_REGEX: {
            if (!oldContent) {
              return JSON.stringify({
                ok: false,
                tool: "edit_file",
                error: "'oldContent' is required for REPLACE_REGEX",
                data: {
                  targetFile: targetResolved,
                  action: EditFileAction.REPLACE_REGEX,
                },
              });
            }

            return await replaceRegexInFile(
              targetResolved,
              oldContent,
              reFlags,
              newContent,
              bytesBefore,
            );
          }

          case EditFileAction.PATCH: {
            return await patchFile(targetResolved, newContent, bytesBefore);
          }

          case EditFileAction.UNDO: {
            return await undoFile(targetResolved, backupResolvedDir);
          }

          default: {
            return JSON.stringify({
              ok: false,
              tool: "edit_file",
              error: `Unknown action: ${action}`,
              data: { targetFile: targetResolved, action },
            });
          }
        }
      } catch (e) {
        return JSON.stringify({
          ok: false,
          tool: "edit_file",
          error: `Error editing file: ${
            e instanceof Error ? e.message : String(e)
          }`,
          data: { targetFile: targetResolved, action },
        });
      }
    },
  });

  return { EditFileTool };
}
