import { z } from "zod";
import { createTool, type Tool, type ToolExecutionContext } from "../mod.ts";
import * as path from "@std/path";

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
  ) => {
    const adapter = ctx.fileSystemAdapter;

    // Check if source file exists
    if (!(await adapter.exists(sourceFile))) {
      throw new Error(`Source file not found: ${sourceFile}`);
    }

    // Check if destination file already exists
    const destinationExists = await adapter.exists(destinationFile);
    if (destinationExists && !overwrite) {
      throw new Error(
        `Destination file already exists: ${destinationFile}. Use overwrite=true to replace it.`,
      );
    }

    // Create destination directory if needed
    await adapter.ensureDir(path.dirname(destinationFile));

    // Copy the file
    await adapter.copyFile(sourceFile, destinationFile);
    return `Successfully copied file from ${sourceFile} to ${destinationFile}${
      destinationExists ? " (overwritten)" : ""
    }.`;
  },
});
