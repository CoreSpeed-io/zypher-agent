import type { Tool } from "../mod.ts";
import { CopyFileTool } from "./copy_file_tool.ts";
import { DeleteFileTool } from "./delete_file_tool.ts";
import { createEditFileTools } from "./edit_file_tool.ts";
import { FileSearchTool } from "./file_search_tool.ts";
import { GrepSearchTool } from "./grep_search_tool.ts";
import { ListDirTool } from "./list_dir_tool.ts";
import { ReadFileTool } from "./read_file_tool.ts";

export {
  CopyFileTool,
  createEditFileTools,
  DeleteFileTool,
  FileSearchTool,
  GrepSearchTool,
  ListDirTool,
  ReadFileTool,
};

/**
 * Creates all built-in filesystem tools for easy registration.
 *
 * @param options - Optional configuration for the filesystem tools
 * @param options.backupDir - Custom backup directory for edit tools.
 *  If not provided, defaults to {workspaceDataDir}/backup.
 * @returns An array of all filesystem tools ready for registration
 *
 * @example
 * ```ts
 * const agent = await createZypherAgent({
 *   modelProvider,
 *   tools: [...createFileSystemTools()],
 * });
 * ```
 */
export function createFileSystemTools(
  options?: { backupDir?: string },
): Tool[] {
  return [
    ReadFileTool,
    ListDirTool,
    ...createEditFileTools(options?.backupDir),
    GrepSearchTool,
    FileSearchTool,
    CopyFileTool,
    DeleteFileTool,
  ];
}
