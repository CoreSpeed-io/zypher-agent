import { ensureDir } from "@std/fs";
import type { ZypherContext } from "../ZypherAgent.ts";
import type { FileSystemAdapter } from "../tools/fs/FileSystemAdapter.ts";
import { LocalFileSystemAdapter } from "../tools/fs/LocalFileSystemAdapter.ts";
import type { Shell } from "../command/Shell.ts";
import { LocalShell } from "../command/LocalShell.ts";

/**
 * Options for creating a ZypherContext.
 */
export interface CreateZypherContextOptions {
  /** Absolute path to the working directory */
  workingDirectory: string;
  /** Base zypher directory (defaults to ~/.zypher or ZYPHER_HOME) */
  zypherDir?: string;
  /** Unique identifier for tracking user-specific usage history */
  userId?: string;
  /** Custom filesystem adapter (defaults to LocalFileSystemAdapter) */
  fileSystemAdapter?: FileSystemAdapter;
  /** Custom shell (defaults to LocalShell) */
  shell?: Shell;
}

/**
 * Creates a ZypherContext for the given working directory.
 * This function consolidates the workspace directory creation logic
 * that was previously duplicated across the codebase.
 *
 * @param options Configuration options for the context
 * @returns Promise resolving to ZypherContext with adapters
 */
export async function createZypherContext(
  options: CreateZypherContextOptions,
): Promise<ZypherContext> {
  // Create filesystem adapter (defaults to local)
  const fileSystemAdapter = options.fileSystemAdapter ??
    new LocalFileSystemAdapter({
      workingDirectory: options.workingDirectory,
      zypherDir: options.zypherDir,
    });

  // Create shell (defaults to local)
  const shell = options.shell ?? new LocalShell();

  // Ensure directories exist for local adapter
  if (fileSystemAdapter instanceof LocalFileSystemAdapter) {
    await ensureDir(fileSystemAdapter.zypherDir);
    await ensureDir(fileSystemAdapter.workspaceDataDir);
    await ensureDir(fileSystemAdapter.fileAttachmentCacheDir);
  }

  return {
    userId: options.userId,
    fileSystemAdapter,
    shell,
  };
}
