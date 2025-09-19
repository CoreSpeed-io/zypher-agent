import { z } from "zod";
import { defineTool, type Tool, type ToolExecutionContext } from "./mod.ts";
import * as path from "@std/path";
import { fileExists } from "../utils/mod.ts";
import { ensureDir } from "@std/fs";

export const DeleteFileTool: Tool<{
  targetFile: string;
  explanation?: string | undefined;
}> = defineTool({
  name: "delete_file",
  description: "Deletes a file at the specified path.",
  parameters: z.object({
    targetFile: z
      .string()
      .describe(
        "The path of the file to delete (relative or absolute).",
      ),
    explanation: z
      .string()
      .optional()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async ({ targetFile }, ctx: ToolExecutionContext) => {
    try {
      const resolved = path.resolve(ctx.workingDirectory, targetFile);
      await Deno.remove(resolved);
      return `Successfully deleted file: ${resolved}`;
    } catch (error) {
      if (error instanceof Error) {
        if (error instanceof Deno.errors.NotFound) {
          return `File not found: ${targetFile}`;
        }
        if (error instanceof Deno.errors.PermissionDenied) {
          return `Permission denied to delete file: ${targetFile}`;
        }
        return `Error deleting file: ${error.message}`;
      }
      return "Error deleting file: Unknown error";
    }
  },
});

export const CopyFileTool: Tool<{
  sourceFile: string;
  destinationFile: string;
  overwrite?: boolean | undefined;
  explanation?: string | undefined;
}> = defineTool({
  name: "copy_file",
  description: "Copies a file from the source path to the destination path.",
  parameters: z.object({
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
  ) => {
    try {
      const resolve = (p: string) => path.resolve(ctx.workingDirectory, p);
      const srcResolved = resolve(sourceFile);
      const dstResolved = resolve(destinationFile);
      // Check if source file exists
      if (!(await fileExists(srcResolved))) {
        return `Error: Source file not found: ${srcResolved}`;
      }

      // Check if destination file already exists
      const destinationExists = await fileExists(dstResolved);
      if (destinationExists && !overwrite) {
        return `Destination file already exists: ${dstResolved}. Use overwrite=true to replace it.`;
      }

      // Create destination directory if needed
      await ensureDir(path.dirname(dstResolved));

      // Copy the file
      await Deno.copyFile(srcResolved, dstResolved);
      return `Successfully copied file from ${srcResolved} to ${dstResolved}${
        destinationExists ? " (overwritten)" : ""
      }.`;
    } catch (error) {
      if (error instanceof Error) {
        if (error instanceof Deno.errors.PermissionDenied) {
          return `Permission denied to copy file: ${error.message}`;
        }
        return `Error copying file: ${error.message}`;
      }
      return "Error copying file: Unknown error";
    }
  },
});
