import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool } from "./index.ts";

const execAsync = promisify(exec);

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export const FileSearchTool = defineTool({
  name: "file_search",
  description:
    "Fast file search based on fuzzy matching against file path. Use if you know part of the file path but don't know where it's located exactly. Response will be capped to 10 results. Make your query more specific if need to filter results further.",
  parameters: z.object({
    query: z.string().describe("Fuzzy filename to search for"),
    explanation: z
      .string()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async ({ query }) => {
    try {
      // Using fd (modern alternative to find) with fuzzy matching
      const command = `fd -t f -d 10 -l ${escapeShellArg(query)}`;

      const { stdout, stderr } = await execAsync(command);
      if (!stdout && !stderr) {
        return "No matching files found.";
      }

      // Split results and take only first 10
      const files = stdout
        .split("\n")
        .filter(Boolean)
        .slice(0, 10)
        .map((file) => `- ${file}`)
        .join("\n");

      if (stderr) {
        return `Search completed with warnings:\n${stderr}\nMatching files:\n${files}`;
      }

      return `Matching files:\n${files}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error searching files: ${error.message}`;
      }
      return "Error searching files: Unknown error";
    }
  },
});
