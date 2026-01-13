/**
 * FileSystemAdapter provides an abstraction over filesystem operations,
 * enabling tools to work with various environments (local, E2B, Cloudflare, etc.)
 *
 * @module
 */

/**
 * File information returned by stat operations.
 * Compatible with Deno.FileInfo structure.
 */
export interface FileInfo {
  /** True if this is a directory */
  isDirectory: boolean;
  /** True if this is a regular file */
  isFile: boolean;
  /** True if this is a symbolic link */
  isSymlink: boolean;
  /** File size in bytes */
  size: number;
  /** Last modification time (null if not available) */
  mtime: Date | null;
  /** Last access time (null if not available) */
  atime: Date | null;
  /** Creation time (null if not available) */
  birthtime: Date | null;
}

/**
 * Directory entry returned by readDir operations.
 * Compatible with Deno.DirEntry structure.
 */
export interface DirEntry {
  /** Name of the entry (not the full path) */
  name: string;
  /** True if this is a directory */
  isDirectory: boolean;
  /** True if this is a regular file */
  isFile: boolean;
  /** True if this is a symbolic link */
  isSymlink: boolean;
}

/**
 * File handle for streaming file operations.
 * Used for line-by-line reading and binary chunk reading.
 */
export interface FileHandle {
  /**
   * Read bytes into the buffer.
   * @returns Number of bytes read, or null if EOF.
   */
  read(buffer: Uint8Array): Promise<number | null>;

  /**
   * Close the file handle and release resources.
   */
  close(): void;

  /**
   * Get a readable stream for the file (optional, for adapters that support streams).
   */
  readonly readable?: ReadableStream<Uint8Array>;
}

/**
 * Options for opening a file.
 */
export interface FileOpenOptions {
  read?: boolean;
  write?: boolean;
  create?: boolean;
  truncate?: boolean;
  append?: boolean;
}

/**
 * Abstract filesystem adapter interface.
 *
 * Implementations can target:
 * - Local filesystem (Deno)
 * - E2B cloud sandbox
 * - Cloudflare Workers
 * - Browser environments
 * - Any other environment with filesystem capabilities
 *
 * All file operation methods accept relative or absolute paths.
 * Relative paths are resolved against `workingDirectory` internally.
 */
export interface FileSystemAdapter {
  // ============================================
  // Path properties (moved from ZypherContext)
  // ============================================

  /**
   * Working directory where file operations are performed.
   * Relative paths passed to file operations are resolved against this.
   */
  readonly workingDirectory: string;

  /**
   * Base zypher directory for agent data storage.
   * Typically `~/.zypher` for local environments.
   */
  readonly zypherDir: string;

  /**
   * Workspace-specific data directory for isolated storage.
   * Used for message history, checkpoints, and other workspace-specific data.
   */
  readonly workspaceDataDir: string;

  /**
   * Directory to cache file attachments.
   */
  readonly fileAttachmentCacheDir: string;

  // ============================================
  // File operations
  // ============================================

  /**
   * Read an entire file as a UTF-8 string.
   * @param path - Relative or absolute path to the file
   * @throws Error if file doesn't exist or isn't readable
   */
  readTextFile(path: string): Promise<string>;

  /**
   * Read an entire file as binary data.
   * Used for images and other binary files.
   * @param path - Relative or absolute path to the file
   * @throws Error if file doesn't exist or isn't readable
   */
  readFile(path: string): Promise<Uint8Array>;

  /**
   * Write a UTF-8 string to a file.
   * Creates the file if it doesn't exist, truncates if it does.
   * @param path - Relative or absolute path to the file
   * @param content - UTF-8 string content to write
   */
  writeTextFile(path: string, content: string): Promise<void>;

  /**
   * Write binary data to a file.
   * Creates the file if it doesn't exist, truncates if it does.
   * @param path - Relative or absolute path to the file
   * @param data - Binary data to write
   */
  writeFile(path: string, data: Uint8Array): Promise<void>;

  /**
   * Copy a file from source to destination.
   * @param src - Relative or absolute path to the source file
   * @param dest - Relative or absolute path to the destination
   * @throws Error if source doesn't exist
   */
  copyFile(src: string, dest: string): Promise<void>;

  /**
   * Remove a file or directory.
   * @param path - Relative or absolute path to remove
   * @param options.recursive - If true, remove directory contents recursively
   * @throws Error if path doesn't exist
   */
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Get file or directory metadata.
   * @param path - Relative or absolute path
   * @throws Error if path doesn't exist
   */
  stat(path: string): Promise<FileInfo>;

  /**
   * Iterate over directory entries.
   * Does not include "." or ".." entries.
   * @param path - Relative or absolute path to the directory
   * @throws Error if path doesn't exist or isn't a directory
   */
  readDir(path: string): AsyncIterable<DirEntry>;

  /**
   * Ensure a directory exists, creating it and parent directories as needed.
   * Does nothing if directory already exists.
   * @param path - Relative or absolute path to the directory
   */
  ensureDir(path: string): Promise<void>;

  /**
   * Open a file for streaming operations.
   * Required for efficient line-by-line reading of large files.
   * @param path - Relative or absolute path to the file
   * @param options - File open options
   */
  open(path: string, options: FileOpenOptions): Promise<FileHandle>;

  /**
   * Check if a file or directory exists.
   * Returns false instead of throwing for non-existent paths.
   * @param path - Relative or absolute path
   */
  exists(path: string): Promise<boolean>;
}
