import { z } from "zod";
import { defineTool } from "./mod.ts";
import * as path from "@std/path";

export const ListDirTool = defineTool({
  name: "list_dir",
  description:
    "List the contents of a directory. The quick tool to use for discovery, before using more targeted tools like semantic search or file reading. Useful to try to understand the file structure before diving deeper into specific files. Can be used to explore the codebase.",
  parameters: z.object({
    relativePath: z
      .string()
      .describe("Path to list contents of, relative to the workspace root."),
    explanation: z
      .string()
      .optional()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async ({ relativePath }) => {
    try {
      const entries = [];
      for await (const entry of Deno.readDir(relativePath)) {
        const fullPath = path.join(relativePath, entry.name);
        const fileInfo = await Deno.stat(fullPath);
        const type = entry.isDirectory ? "directory" : "file";
        const size = fileInfo.size;
        entries.push(`[${type}] ${entry.name} (${size} bytes)`);
      }
      return entries.join("\n");
    } catch (error) {
      if (error instanceof Error) {
        return `Error listing directory: ${error.message}`;
      }
      return "Error listing directory: Unknown error";
    }
  },
});
