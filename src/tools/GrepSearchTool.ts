import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { defineTool } from './index';

const execAsync = promisify(exec);

export const GrepSearchTool = defineTool({
  name: 'grep_search',
  description: 'Fast text-based regex search that finds exact pattern matches within files or directories.',
  parameters: z.object({
    query: z.string().describe('The regex pattern to search for'),
    caseSensitive: z.boolean().optional().describe('Whether the search should be case sensitive'),
    includePattern: z.string().optional().describe('Glob pattern for files to include'),
    excludePattern: z.string().optional().describe('Glob pattern for files to exclude'),
    explanation: z.string().optional().describe('One sentence explanation for tool usage'),
  }),
  execute: async ({ query, caseSensitive, includePattern, excludePattern }) => {
    try {
      let command = 'rg --line-number --no-heading';
      
      if (!caseSensitive) {
        command += ' -i';
      }

      if (includePattern) {
        command += ` -g '${includePattern}'`;
      }

      if (excludePattern) {
        command += ` -g '!${excludePattern}'`;
      }

      // Add max count to avoid overwhelming output
      command += ' -m 50';

      command += ` '${query}'`;

      const { stdout, stderr } = await execAsync(command);
      if (!stdout && !stderr) {
        return 'No matches found.';
      }
      if (stderr) {
        return `Search completed with warnings:\n${stderr}\nResults:\n${stdout}`;
      }
      return stdout;
    } catch (error) {
      if (error instanceof Error) {
        return `Error performing search: ${error.message}`;
      }
      return 'Error performing search: Unknown error';
    }
  },
}); 