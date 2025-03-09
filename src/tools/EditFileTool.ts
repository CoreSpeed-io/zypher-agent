import { z } from 'zod';
import { defineTool } from './index';
import * as fs from 'fs/promises';
import * as path from 'path';

export const EditFileTool = defineTool({
  name: 'edit_file',
  description:
    "Use this tool to edit a file by providing its complete new content.\n\nThis tool expects the entire file content to be provided, not just the changes.\nThe content will completely replace the existing file content (or create a new file if it doesn't exist).\n\nWhen using this tool:\n1. Provide the complete file content including all necessary imports and dependencies\n2. Ensure the content is properly formatted and follows the project's code style\n3. Include appropriate error handling and type safety measures\n4. Add descriptive comments for complex logic",
  parameters: z.object({
    targetFile: z
      .string()
      .describe(
        'The target file to modify. Always specify the target file as the first argument and use the relative path in the workspace of the file to edit',
      ),
    instructions: z
      .string()
      .describe('A single sentence instruction describing what you are going to do for the edit'),
    codeEdit: z
      .string()
      .describe(
        'The complete new content for the file. This will replace the entire existing content or create a new file.',
      ),
  }),
  execute: async ({ targetFile, instructions, codeEdit }) => {
    try {
      // Ensure the directory exists
      const dir = path.dirname(targetFile);
      await fs.mkdir(dir, { recursive: true });

      // Write the file
      await fs.writeFile(targetFile, codeEdit);
      return `Successfully wrote ${targetFile}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error editing file: ${error.message}`;
      }
      return 'Error editing file: Unknown error';
    }
  },
});
