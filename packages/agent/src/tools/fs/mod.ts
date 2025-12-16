import type { Tool } from "../mod.ts";
import { ReadFileTool } from "./ReadFileTool.ts";
import { ListDirTool } from "./ListDirTool.ts";
import { createEditFileTools } from "./EditFileTool.ts";
import { GrepSearchTool } from "./GrepSearchTool.ts";
import { FileSearchTool } from "./FileSearchTool.ts";
import { CopyFileTool } from "./CopyFileTool.ts";
import { DeleteFileTool } from "./DeleteFileTool.ts";

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
