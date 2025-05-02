import { z } from "zod";
import { defineTool } from "./mod.ts";
import * as path from "@std/path";
import { fileExists } from "../utils/mod.ts";
import { ensureDir } from "@std/fs";

export const DeleteFileTool = defineTool({
  name: "delete_file",
  description: "Deletes a file at the specified path.",
  parameters: z.object({
    targetFile: z
      .string()
      .describe(
        "The path of the file to delete, relative to the workspace root.",
      ),
    explanation: z
      .string()
      .optional()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async ({ targetFile }) => {
    try {
      await Deno.remove(targetFile);
      return `Successfully deleted file: ${targetFile}`;
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

export const CopyFileTool = defineTool({
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
  ) => {
    try {
      // Check if source file exists
      if (!(await fileExists(sourceFile))) {
        return `Error: Source file not found: ${sourceFile}`;
      }

      // Check if destination file already exists
      const destinationExists = await fileExists(destinationFile);
      if (destinationExists && !overwrite) {
        return `Destination file already exists: ${destinationFile}. Use overwrite=true to replace it.`;
      }

      // Create destination directory if needed
      await ensureDir(path.dirname(destinationFile));

      // Copy the file
      await Deno.copyFile(sourceFile, destinationFile);
      return `Successfully copied file from ${sourceFile} to ${destinationFile}${
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
