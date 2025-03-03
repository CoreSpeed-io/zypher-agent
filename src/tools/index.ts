import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import type {
  Tool,
  ReadFileParams,
  ListDirParams,
  EditFileParams,
} from '../types';

export class ReadFileTool implements Tool<ReadFileParams> {
  readonly name = 'read_file';
  readonly description = 'Read the contents of a file.';

  readonly parameters = {
    type: 'object' as const,
    properties: {
      filePath: {
        type: 'string',
        description: 'The path to the file to read.',
      },
      startLine: {
        type: 'number',
        description: 'The line number to start reading from (1-indexed).',
        default: 1,
      },
      endLine: {
        type: 'number',
        description: 'The line number to end reading at (1-indexed, inclusive).',
        optional: true,
      },
    },
    required: ['filePath'],
  };

  async execute(params: ReadFileParams): Promise<string> {
    try {
      const content = await readFile(params.filePath, 'utf-8');
      const lines = content.split('\n');

      const startIdx = Math.max(0, params.startLine - 1);
      const endIdx = params.endLine ? Math.min(lines.length, params.endLine) : lines.length;

      const selectedLines = lines.slice(startIdx, endIdx);
      return selectedLines.join('\n');
    } catch (error) {
      if (error instanceof Error) {
        return `Error reading file: ${error.message}`;
      }
      return 'Error reading file: Unknown error';
    }
  }
}

export class ListDirTool implements Tool<ListDirParams> {
  readonly name = 'list_dir';
  readonly description = 'List the contents of a directory.';

  readonly parameters = {
    type: 'object' as const,
    properties: {
      dirPath: {
        type: 'string',
        description: 'The path to the directory to list.',
      },
    },
    required: ['dirPath'],
  };

  async execute(params: ListDirParams): Promise<string> {
    try {
      const entries = await readdir(params.dirPath);
      const results = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = join(params.dirPath, entry);
          const stats = await stat(fullPath);
          const type = stats.isDirectory() ? 'directory' : 'file';
          const size = stats.size;
          return `[${type}] ${entry} (${size} bytes)`;
        })
      );
      return results.join('\n');
    } catch (error) {
      if (error instanceof Error) {
        return `Error listing directory: ${error.message}`;
      }
      return 'Error listing directory: Unknown error';
    }
  }
}

export class EditFileTool implements Tool<EditFileParams> {
  readonly name = 'edit_file';
  readonly description = 'Edit or create a file with the given content.';

  readonly parameters = {
    type: 'object' as const,
    properties: {
      filePath: {
        type: 'string',
        description: 'The path to the file to edit.',
      },
      content: {
        type: 'string',
        description: 'The new content to write to the file.',
      },
      append: {
        type: 'boolean',
        description: 'Whether to append to the file instead of overwriting it.',
        default: false,
      },
    },
    required: ['filePath', 'content'],
  };

  async execute(params: EditFileParams): Promise<string> {
    try {
      const { filePath, content, append } = params;
      const flag = append ? 'a' : 'w';

      await writeFile(filePath, content, { flag });
      return `Successfully ${append ? 'appended to' : 'wrote'} file: ${filePath}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error editing file: ${error.message}`;
      }
      return 'Error editing file: Unknown error';
    }
  }
} 