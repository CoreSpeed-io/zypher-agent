import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { defineTool } from './index';

export const ListDirTool = defineTool({
  name: 'list_dir',
  description: 'List the contents of a directory.',
  parameters: z.object({
    dirPath: z.string().describe('The path to the directory to list.'),
  }),
  execute: async ({ dirPath }) => {
    try {
      const entries = await readdir(dirPath);
      const results = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = join(dirPath, entry);
          const stats = await stat(fullPath);
          const type = stats.isDirectory() ? 'directory' : 'file';
          const size = stats.size;
          return `[${type}] ${entry} (${size} bytes)`;
        }),
      );
      return results.join('\n');
    } catch (error) {
      if (error instanceof Error) {
        return `Error listing directory: ${error.message}`;
      }
      return 'Error listing directory: Unknown error';
    }
  },
});
