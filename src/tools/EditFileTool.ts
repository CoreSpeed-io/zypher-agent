import { writeFile } from 'fs/promises';
import { z } from 'zod';
import { defineTool } from './index';

export const EditFileTool = defineTool({
  name: 'edit_file',
  description: 'Edit or create a file with the given content.',
  parameters: z.object({
    filePath: z.string().describe('The path to the file to edit.'),
    content: z.string().describe('The new content to write to the file.'),
    append: z
      .boolean()
      .default(false)
      .describe('Whether to append to the file instead of overwriting it.'),
  }),
  execute: async ({ filePath, content, append }) => {
    try {
      const flag = append ? 'a' : 'w';
      await writeFile(filePath, content, { flag });
      return `Successfully ${append ? 'appended to' : 'wrote'} file: ${filePath}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error editing file: ${error.message}`;
      }
      return 'Error editing file: Unknown error';
    }
  },
});
