import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { defineTool } from './index';

export const ListDirTool = defineTool({
  name: 'list_dir',
  description:
    'List the contents of a directory. The quick tool to use for discovery, before using more targeted tools like semantic search or file reading. Useful to try to understand the file structure before diving deeper into specific files. Can be used to explore the codebase.',
  parameters: z.object({
    relativePath: z.string().describe('Path to list contents of, relative to the workspace root.'),
    explanation: z
      .string()
      .optional()
      .describe(
        'One sentence explanation as to why this tool is being used, and how it contributes to the goal.',
      ),
  }),
  execute: async ({ relativePath }) => {
    try {
      const entries = await readdir(relativePath);
      const results = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = join(relativePath, entry);
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
