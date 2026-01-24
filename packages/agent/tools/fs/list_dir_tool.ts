import { z } from "zod";
import {
  createTool,
  type Tool,
  type ToolExecuteOptions,
  type ToolExecutionContext,
} from "../mod.ts";
import * as path from "@std/path";

export const ListDirTool: Tool<{
  targetPath: string;
  explanation?: string | undefined;
}> = createTool({
  name: "list_dir",
  description:
    "List the contents of a directory. The quick tool to use for discovery, before using more targeted tools like semantic search or file reading. Useful to try to understand the file structure before diving deeper into specific files. Can be used to explore the codebase.",
  schema: z.object({
    targetPath: z
      .string()
      .describe("Path to list contents of (relative or absolute)."),
    explanation: z
      .string()
      .optional()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async (
    { targetPath },
    ctx: ToolExecutionContext,
    options?: ToolExecuteOptions,
  ) => {
    const entries: string[] = [];
    const basePath = path.resolve(ctx.workingDirectory, targetPath);
    for await (const entry of Deno.readDir(basePath)) {
      options?.signal?.throwIfAborted();
      const fullPath = path.join(basePath, entry.name);
      const fileInfo = await Deno.stat(fullPath);
      const type = entry.isDirectory ? "directory" : "file";
      const size = fileInfo.size;
      entries.push(`[${type}] ${entry.name} (${size} bytes)`);
    }
    return entries.join("\n");
  },
});
