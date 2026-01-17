import * as path from "@std/path";
import { z } from "zod";
import { createTool, type Tool, type ToolExecutionContext } from "../mod.ts";

export const DeleteFileTool: Tool<{
  targetFile: string;
  explanation?: string | undefined;
}> = createTool({
  name: "delete_file",
  description: "Deletes a file at the specified path.",
  schema: z.object({
    targetFile: z
      .string()
      .describe("The path of the file to delete (relative or absolute)."),
    explanation: z
      .string()
      .optional()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async ({ targetFile }, ctx: ToolExecutionContext) => {
    const resolved = path.resolve(ctx.workingDirectory, targetFile);
    await Deno.remove(resolved);
    return `Successfully deleted file: ${resolved}`;
  },
});
