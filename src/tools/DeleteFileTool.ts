import { unlink } from 'fs/promises';
import { z } from 'zod';
import { defineTool } from './index';

export const DeleteFileTool = defineTool({
  name: 'delete_file',
  description: 'Deletes a file at the specified path.',
  parameters: z.object({
    targetFile: z.string().describe('The path of the file to delete'),
    explanation: z.string().optional().describe('One sentence explanation for tool usage'),
  }),
  execute: async ({ targetFile }) => {
    try {
      await unlink(targetFile);
      return `Successfully deleted file: ${targetFile}`;
    } catch (error) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return `File not found: ${targetFile}`;
        }
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          return `Permission denied to delete file: ${targetFile}`;
        }
        return `Error deleting file: ${error.message}`;
      }
      return 'Error deleting file: Unknown error';
    }
  },
}); 