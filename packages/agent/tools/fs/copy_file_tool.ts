import { z } from "zod";
import {
  createTool,
  type Tool,
  type ToolExecuteOptions,
  type ToolExecutionContext,
} from "../mod.ts";
import * as path from "@std/path";
import { ensureDir, exists } from "@std/fs";

export const CopyFileTool: Tool<{
  sourceFile: string;
  destinationFile: string;
  overwrite?: boolean | undefined;
  explanation?: string | undefined;
}> = createTool({
  name: "copy_file",
  description: "Copies a file from the source path to the destination path.",
  schema: z.object({
    sourceFile: z
      .string()
      .describe("The path of the source file to copy."),
    destinationFile: z
      .string()
      .describe("The path where the file should be copied to."),
    overwrite: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Whether to overwrite the destination file if it already exists.",
      ),
    explanation: z
      .string()
      .optional()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async (
    { sourceFile, destinationFile, overwrite },
    ctx: ToolExecutionContext,
    options?: ToolExecuteOptions,
  ) => {
    const srcResolved = path.resolve(ctx.workingDirectory, sourceFile);
    const dstResolved = path.resolve(ctx.workingDirectory, destinationFile);

    options?.signal?.throwIfAborted();
    if (!(await exists(srcResolved))) {
      throw new Error(`Source file not found: ${srcResolved}`);
    }

    options?.signal?.throwIfAborted();
    const destinationExists = await exists(dstResolved);
    if (destinationExists && !overwrite) {
      throw new Error(
        `Destination file already exists: ${dstResolved}. Use overwrite=true to replace it.`,
      );
    }

    options?.signal?.throwIfAborted();
    await ensureDir(path.dirname(dstResolved));

    options?.signal?.throwIfAborted();
    await Deno.copyFile(srcResolved, dstResolved);
    return `Successfully copied file from ${srcResolved} to ${dstResolved}${
      destinationExists ? " (overwritten)" : ""
    }.`;
  },
});
