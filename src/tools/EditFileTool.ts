import { z } from "zod";
import { defineTool, type Tool } from "./mod.ts";
import { applyPatch } from "npm:diff";
import { fileExists } from "../utils/data.ts";

const BACKUP_DIR = "./.backup";

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

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function statBytes(path: string): Promise<number> {
  try {
    const s = await Deno.stat(path);
    return s.size ?? 0;
  } catch {
    return 0;
  }
}

async function readFileUtf8(path: string): Promise<string> {
  const data = await Deno.readFile(path);
  return textDecoder.decode(data);
}

async function writeFileUtf8(path: string, content: string): Promise<void> {
  const data = textEncoder.encode(content);
  await Deno.writeFile(path, data);
}

function errorResponse(
  targetFile: string,
  action: EditFileAction,
  msg: string,
) {
  return JSON.stringify({
    ok: false,
    tool: "edit_file",
    error: msg,
    data: { targetFile, action },
  });
}

function okResponse(
  data: Record<string, unknown>,
) {
  return JSON.stringify({
    ok: true,
    tool: "edit_file",
    data,
  });
}

async function createFile(targetFile: string, content: string) {
  try {
    const parent = targetFile.split("/").slice(0, -1).join("/");
    if (parent) await Deno.mkdir(parent, { recursive: true });

    const data = textEncoder.encode(content);
    await Deno.writeFile(targetFile, data, { createNew: true });

    const bytesAfter = await statBytes(targetFile);
    return okResponse({
      targetFile,
      action: EditFileAction.CREATE,
      bytesBefore: 0,
      bytesAfter,
      changed: true,
      details: { created: true },
    });
  } catch (e) {
    return errorResponse(
      targetFile,
      EditFileAction.CREATE,
      `Failed to create file: ${e instanceof Error ? e.message : e}`,
    );
  }
}

async function overwriteFile(
  targetFile: string,
  content: string,
  bytesBefore: number,
) {
  try {
    await writeFileUtf8(targetFile, content);
    const bytesAfter = await statBytes(targetFile);
    return okResponse({
      targetFile,
      action: EditFileAction.OVERWRITE,
      bytesBefore,
      bytesAfter,
      changed: bytesBefore !== bytesAfter,
      details: { overwritten: true },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse(
      targetFile,
      EditFileAction.OVERWRITE,
      `Failed to overwrite file: ${msg}`,
    );
  }
}
async function insertFileAt(
  targetFile: string,
  content: string,
  insertPosition: number,
  bytesBefore: number,
) {
  try {
    const original = await readFileUtf8(targetFile);
    const lines = original.split("\n");
    const insertAt = Math.max(0, insertPosition - 1);

    lines.splice(insertAt, 0, ...content.split("\n"));
    const out = lines.join("\n");

    await writeFileUtf8(targetFile, out);
    const bytesAfter = await statBytes(targetFile);

    return okResponse({
      targetFile,
      action: EditFileAction.INSERT,
      bytesBefore,
      bytesAfter,
      changed: out !== original,
      details: {
        insertPosition,
        insertedLines: content.split("\n").length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse(
      targetFile,
      EditFileAction.INSERT,
      `Failed to insert file: ${msg}`,
    );
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
    const original = await readFileUtf8(targetFile);
    const output = replaceAll
      ? original.replaceAll(matchString, replacement)
      : original.replace(matchString, replacement);

    const occurrences = original.split(matchString).length - 1;

    if (occurrences > 0) {
      await writeFileUtf8(targetFile, output);
    }

    const bytesAfter = await statBytes(targetFile);
    return okResponse({
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
    return errorResponse(
      targetFile,
      action,
      `Failed to replace string in file: ${e instanceof Error ? e.message : e}`,
    );
  }
}

async function replaceRegexInFile(
  targetFile: string,
  pattern: string,
  reFlags: string,
  replacement: string,
  bytesBefore: number,
) {
  try {
    const original = await readFileUtf8(targetFile);
    const regex = new RegExp(pattern, reFlags);
    const matches = original.match(regex);

    if (matches) {
      const output = original.replace(regex, replacement);
      await writeFileUtf8(targetFile, output);
    }

    const bytesAfter = await statBytes(targetFile);
    return okResponse({
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
    return errorResponse(
      targetFile,
      EditFileAction.REPLACE_REGEX,
      `Failed to replace regex in file: ${e instanceof Error ? e.message : e}`,
    );
  }
}

async function patchFile(
  targetFile: string,
  diff: string,
  bytesBefore: number,
) {
  try {
    const original = await readFileUtf8(targetFile);
    const patched = applyPatch(original, diff);
    if (patched === false) {
      throw new Error("Failed to apply patch");
    }
    await writeFileUtf8(targetFile, patched);
    const bytesAfter = await statBytes(targetFile);
    return okResponse({
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
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse(
      targetFile,
      EditFileAction.PATCH,
      `Failed to patch file: ${msg}`,
    );
  }
}

async function undoFile(targetFile: string, backupDir: string) {
  try {
    const fileName = targetFile.split("/").pop() || "file";

    const backupFile = `${backupDir}/${fileName}.bak`;
    const backupExists = await fileExists(backupFile);
    if (backupExists) {
      await Deno.copyFile(backupFile, targetFile);
    } else {
      throw new Error("No backup file exists");
    }

    return okResponse({
      targetFile,
      action: EditFileAction.UNDO,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse(
      targetFile,
      EditFileAction.UNDO,
      `Failed to undo changes in file: ${msg}`,
    );
  }
}

export const EditFileTool: Tool<{
  targetFile: string;
  instructions: string;
  action: EditFileAction;
  newContent: string;
  insertPosition?: number;
  oldContent?: string;
  reFlags?: string;
}> = defineTool({
  name: "edit_file",
  description: `Edit a text file using one of several actions.

Parameters:
- targetFile: The target file to edit.
- instructions: One sentence explanation of the intended change (for logging/audit).
- action: One of "insert" | "replace_regex" | "replace_str_first" | "replace_str_all" | "overwrite" | "patch" | "create" | "undo". Default "create".
- newContent: 
  - For OVERWRITE: the full new file content.
  - For INSERT: the text to insert.
  - For REPLACE_STR_*: the replacement text.
  - For REPLACE_REGEX: the replacement text or *pattern* (JS RegExp source string).
  - For PATCH: the unified diff string for PATCH.
- insertPosition (optional): 1-based line number to insert BEFORE (for "insert"). If > EOF, appends at end.
- oldContent (optional):
  - For REPLACE_STR_*: the search string.
  - For REPLACE_REGEX: the regex *pattern* (JS RegExp source string).
- reFlags (optional): the RegExp flags (e.g. "g", "i") to use for REPLACE_REGEX, default is "g".

Behavior:
- Validates file existence before editing (except CREATE).
- Produces metadata about the change (bytes before/after, whether content changed).
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
    targetFile: z.string().describe("The target file to edit"),
    instructions: z.string().describe("Instructions for the edit"),
    action: z.nativeEnum(EditFileAction).describe("The action to perform")
      .default(EditFileAction.CREATE),
    newContent: z.string().describe("The new content for the file"),
    insertPosition: z.number().min(1).optional().describe(
      "1-based line number to insert BEFORE (for insert)",
    ),
    oldContent: z.string().describe("Old content to be replaced").optional(),
    reFlags: z.string().optional().default("g").describe(
      "The RegExp flags (e.g. 'g', 'i') to use for REPLACE_REGEX, default is 'g'",
    ),
  }),

  execute: async (
    {
      targetFile,
      newContent,
      action,
      insertPosition,
      oldContent,
      reFlags,
    },
  ) => {
    await Deno.mkdir(BACKUP_DIR, { recursive: true });
    const fileName = targetFile.split("/").pop() || "file";

    try {
      await Deno.stat(targetFile);
      if (action === EditFileAction.CREATE) {
        return errorResponse(
          targetFile,
          EditFileAction.CREATE,
          `${targetFile} already exists`,
        );
      }
      // Backup original file
      if (action !== EditFileAction.UNDO) {
        await Deno.copyFile(targetFile, `${BACKUP_DIR}/${fileName}.bak`);
      }
    } catch {
      if (action !== EditFileAction.CREATE) {
        return errorResponse(
          targetFile,
          action,
          `${targetFile} does not exist`,
        );
      }
    }

    try {
      const bytesBefore = await statBytes(targetFile);

      switch (action) {
        case EditFileAction.CREATE: {
          return await createFile(targetFile, newContent);
        }
        case EditFileAction.OVERWRITE: {
          return await overwriteFile(targetFile, newContent, bytesBefore);
        }

        case EditFileAction.INSERT: {
          if (!insertPosition) {
            return errorResponse(
              targetFile,
              EditFileAction.INSERT,
              "'insertPosition' is required for INSERT",
            );
          }

          return await insertFileAt(
            targetFile,
            newContent,
            insertPosition,
            bytesBefore,
          );
        }

        case EditFileAction.REPLACE_STR_FIRST: {
          if (!oldContent) {
            return errorResponse(
              targetFile,
              EditFileAction.REPLACE_STR_FIRST,
              "'oldContent' is required for REPLACE_STR_FIRST",
            );
          }
          return await replaceStringInFile(
            targetFile,
            oldContent,
            newContent,
            false,
            bytesBefore,
          );
        }

        case EditFileAction.REPLACE_STR_ALL: {
          if (!oldContent) {
            return errorResponse(
              targetFile,
              EditFileAction.REPLACE_STR_ALL,
              "'oldContent' is required for REPLACE_STR_ALL",
            );
          }
          return await replaceStringInFile(
            targetFile,
            oldContent,
            newContent,
            true,
            bytesBefore,
          );
        }

        case EditFileAction.REPLACE_REGEX: {
          if (!oldContent) {
            return errorResponse(
              targetFile,
              EditFileAction.REPLACE_REGEX,
              "'oldContent' is required for REPLACE_REGEX",
            );
          }

          return await replaceRegexInFile(
            targetFile,
            oldContent,
            reFlags,
            newContent,
            bytesBefore,
          );
        }

        case EditFileAction.PATCH: {
          return await patchFile(targetFile, newContent, bytesBefore);
        }

        case EditFileAction.UNDO: {
          return await undoFile(targetFile, BACKUP_DIR);
        }

        default:
          return errorResponse(
            targetFile,
            action,
            `Unknown action: ${action}`,
          );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(
        targetFile,
        action,
        `Error editing file: ${msg}`,
      );
    }
  },
});
