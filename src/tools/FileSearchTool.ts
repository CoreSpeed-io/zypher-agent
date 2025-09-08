import { z } from "zod";
import { defineTool, type Tool, type ToolExecutionContext } from "./mod.ts";

export const FileSearchTool: Tool<{
  query: string;
  explanation: string;
}> = defineTool({
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
  execute: async ({ query }, ctx?: ToolExecutionContext) => {
    const workingDirectory = ctx?.workingDirectory ?? Deno.cwd();
    try {
      // Using fd (modern alternative to find) with fuzzy matching
      const command = new Deno.Command("fd", {
        args: ["-t", "f", "-d", "10", "-l", query],
        cwd: workingDirectory,
      });

      const { stdout, stderr } = await command.output();
      const textDecoder = new TextDecoder();
      const stdoutText = textDecoder.decode(stdout);
      const stderrText = textDecoder.decode(stderr);

      if (!stdoutText && !stderrText) {
        return "No matching files found.";
      }

      // Split results and take only first 10
      const files = stdoutText
        .split("\n")
        .filter(Boolean)
        .slice(0, 10)
        .map((file) => `- ${file}`)
        .join("\n");

      if (stderrText) {
        return `Search completed with warnings:\n${stderrText}\nMatching files:\n${files}`;
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
