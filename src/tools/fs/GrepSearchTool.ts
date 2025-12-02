import { z } from "zod";
import { createTool, type Tool, type ToolExecutionContext } from "../mod.ts";

export const GrepSearchTool: Tool<{
  query: string;
  caseSensitive?: boolean | undefined;
  includePattern?: string | undefined;
  excludePattern?: string | undefined;
  explanation?: string | undefined;
}> = createTool({
  name: "grep_search",
  description:
    "Fast text-based regex search that finds exact pattern matches within files or directories, utilizing the ripgrep command for efficient searching.\nResults will be formatted in the style of ripgrep and can be configured to include line numbers and content.\nTo avoid overwhelming output, the results are capped at 50 matches.\nUse the include or exclude patterns to filter the search scope by file type or specific paths.\n\nThis is best for finding exact text matches or regex patterns.\nMore precise than semantic search for finding specific strings or patterns.\nThis is preferred over semantic search when we know the exact symbol/function name/etc. to search in some set of directories/file types.",
  schema: z.object({
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
  execute: async (
    { query, caseSensitive, includePattern, excludePattern },
    ctx: ToolExecutionContext,
  ) => {
    // Build the arguments array for ripgrep
    const args = ["--line-number", "--no-heading"];

    if (!caseSensitive) {
      args.push("-i");
    }

    if (includePattern) {
      args.push("-g", includePattern);
    }

    if (excludePattern) {
      args.push("-g", `!${excludePattern}`);
    }

    // Add max count to avoid overwhelming output
    args.push("-m", "50");

    // Add the search query
    args.push(query);

    // Execute the command
    const command = new Deno.Command("rg", {
      args: args,
      cwd: ctx.workingDirectory,
    });

    const { stdout, stderr } = await command.output();
    const textDecoder = new TextDecoder();
    const stdoutText = textDecoder.decode(stdout);
    const stderrText = textDecoder.decode(stderr);

    if (!stdoutText && !stderrText) {
      return "No matches found.";
    }
    if (stderrText) {
      return `Search completed with warnings:\n${stderrText}\nResults:\n${stdoutText}`;
    }
    return stdoutText;
  },
});
