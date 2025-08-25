import { z } from "zod";
import { defineTool, type Tool } from "./mod.ts";

export const ReadFileTool: Tool<{
  relativePath: string;
  startLineOneIndexed: number;
  endLineOneIndexedInclusive: number;
  shouldReadEntireFile: boolean;
  explanation?: string | undefined;
}> = defineTool({
  name: "read_file",
  description:
    "Read the contents of a file. the output of this tool call will be the 1-indexed file contents from start_line_one_indexed to end_line_one_indexed_inclusive, together with a summary of the lines outside start_line_one_indexed and end_line_one_indexed_inclusive.\nNote that this call can view at most 250 lines at a time.\n\nWhen using this tool to gather information, it's your responsibility to ensure you have the COMPLETE context. Specifically, each time you call this command you should:\n1) Assess if the contents you viewed are sufficient to proceed with your task.\n2) Take note of where there are lines not shown.\n3) If the file contents you have viewed are insufficient, and you suspect they may be in lines not shown, proactively call the tool again to view those lines.\n4) When in doubt, call this tool again to gather more information. Remember that partial file views may miss critical dependencies, imports, or functionality.\n\nIn some cases, if reading a range of lines is not enough, you may choose to read the entire file.\nReading entire files is often wasteful and slow, especially for large files (i.e. more than a few hundred lines). So you should use this option sparingly.\nReading the entire file is not allowed in most cases. You are only allowed to read the entire file if it has been edited or manually attached to the conversation by the user.",
  parameters: z.object({
    relativePath: z
      .string()
      .describe(
        "The path of the file to read, relative to the workspace root.",
      ),
    startLineOneIndexed: z
      .number()
      .describe(
        "The one-indexed line number to start reading from (inclusive).",
      ),
    endLineOneIndexedInclusive: z
      .number()
      .describe("The one-indexed line number to end reading at (inclusive)."),
    shouldReadEntireFile: z
      .boolean()
      .describe("Whether to read the entire file. Defaults to false."),
    explanation: z
      .string()
      .optional()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async ({
    relativePath,
    startLineOneIndexed,
    endLineOneIndexedInclusive,
    shouldReadEntireFile,
  }) => {
    try {
      const content = await Deno.readTextFile(relativePath);
      const lines = content.split("\n");

      if (shouldReadEntireFile) {
        return content;
      }

      // Ensure we don't read more than 250 lines at a time
      const maxLines = 250;
      if (endLineOneIndexedInclusive - startLineOneIndexed + 1 > maxLines) {
        return `Error: Cannot read more than ${maxLines} lines at a time. Please adjust the line range.`;
      }

      const startIdx = Math.max(0, startLineOneIndexed - 1);
      const endIdx = Math.min(lines.length, endLineOneIndexedInclusive);

      const selectedLines = lines.slice(startIdx, endIdx);
      let result = "";

      // Add summary of lines before selection
      if (startIdx > 0) {
        result += `[Lines 1-${startIdx} not shown]\n`;
      }

      result += selectedLines.join("\n");

      // Add summary of lines after selection
      if (endIdx < lines.length) {
        result += `\n[Lines ${endIdx + 1}-${lines.length} not shown]`;
      }

      return result;
    } catch (error) {
      if (error instanceof Error) {
        return `Error reading file: ${error.message}`;
      }
      return "Error reading file: Unknown error";
    }
  },
});
