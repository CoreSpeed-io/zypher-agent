import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool } from "./index.ts";

const execAsync = promisify(exec);

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export const GrepSearchTool = defineTool({
  name: "grep_search",
  description:
    "Fast text-based regex search that finds exact pattern matches within files or directories, utilizing the ripgrep command for efficient searching.\nResults will be formatted in the style of ripgrep and can be configured to include line numbers and content.\nTo avoid overwhelming output, the results are capped at 50 matches.\nUse the include or exclude patterns to filter the search scope by file type or specific paths.\n\nThis is best for finding exact text matches or regex patterns.\nMore precise than semantic search for finding specific strings or patterns.\nThis is preferred over semantic search when we know the exact symbol/function name/etc. to search in some set of directories/file types.",
  parameters: z.object({
    query: z.string().describe("The regex pattern to search for"),
    caseSensitive: z
      .boolean()
      .optional()
      .describe("Whether the search should be case sensitive"),
    includePattern: z
      .string()
      .optional()
      .describe(
        "Glob pattern for files to include (e.g. '*.ts' for TypeScript files)",
      ),
    excludePattern: z
      .string()
      .optional()
      .describe("Glob pattern for files to exclude"),
    explanation: z
      .string()
      .optional()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async ({ query, caseSensitive, includePattern, excludePattern }) => {
    try {
      let command = "rg --line-number --no-heading";

      if (!caseSensitive) {
        command += " -i";
      }

      if (includePattern) {
        command += ` -g ${escapeShellArg(includePattern)}`;
      }

      if (excludePattern) {
        command += ` -g !${escapeShellArg(excludePattern)}`;
      }

      // Add max count to avoid overwhelming output
      command += " -m 50";

      command += ` ${escapeShellArg(query)}`;

      const { stdout, stderr } = await execAsync(command);
      if (!stdout && !stderr) {
        return "No matches found.";
      }
      if (stderr) {
        return `Search completed with warnings:\n${stderr}\nResults:\n${stdout}`;
      }
      return stdout;
    } catch (error) {
      if (error instanceof Error) {
        return `Error performing search: ${error.message}`;
      }
      return "Error performing search: Unknown error";
    }
  },
});
