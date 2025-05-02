import { z } from "zod";
import { defineTool } from "./mod.ts";

export const DeleteFileTool = defineTool({
  name: "delete_file",
  description:
    "Deletes a file at the specified path. The operation will fail gracefully if:\n    - The file doesn't exist\n    - The operation is rejected for security reasons\n    - The file cannot be deleted",
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
