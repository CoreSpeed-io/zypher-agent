import { readFile } from 'fs/promises';
import { z } from 'zod';
import { defineTool } from './index';

export const ReadFileTool = defineTool({
  name: 'read_file',
  description: 'Read the contents of a file.',
  parameters: z.object({
    filePath: z.string().describe('The path to the file to read.'),
    startLine: z.number().default(1).describe('The line number to start reading from (1-indexed).'),
    endLine: z
      .number()
      .optional()
      .describe('The line number to end reading at (1-indexed, inclusive).'),
  }),
  execute: async ({ filePath, startLine, endLine }) => {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const startIdx = Math.max(0, startLine - 1);
      const endIdx = endLine ? Math.min(lines.length, endLine) : lines.length;

      const selectedLines = lines.slice(startIdx, endIdx);
      return selectedLines.join('\n');
    } catch (error) {
      if (error instanceof Error) {
        return `Error reading file: ${error.message}`;
      }
      return 'Error reading file: Unknown error';
    }
  },
});
