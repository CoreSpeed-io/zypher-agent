/**
 * LocalFileSystemAdapter provides a local filesystem implementation
 * using Deno APIs.
 *
 * @module
 */

import * as path from "@std/path";
import { ensureDir as stdEnsureDir } from "@std/fs";
import { encodeBase64 } from "@std/encoding/base64";
import type {
  DirEntry,
  FileHandle,
  FileInfo,
  FileOpenOptions,
  FileSystemAdapter,
} from "./FileSystemAdapter.ts";

/**
 * Options for creating a LocalFileSystemAdapter.
 */
export interface LocalFileSystemAdapterOptions {
  /**
   * Working directory where file operations are performed.
   * Relative paths are resolved against this directory.
   */
  workingDirectory: string;

  /**
   * Base zypher directory for agent data storage.
   * Defaults to ~/.zypher or ZYPHER_HOME environment variable.
   */
  zypherDir?: string;

  /**
   * Workspace-specific data directory.
   * Defaults to computed path based on workingDirectory.
   */
  workspaceDataDir?: string;

  /**
   * Directory to cache file attachments.
   * Defaults to {zypherDir}/cache/files.
   */
  fileAttachmentCacheDir?: string;
}

/**
 * Gets the default zypher directory.
 * Checks ZYPHER_HOME environment variable first, then falls back to ~/.zypher
 */
function getDefaultZypherDir(): string {
  const zypherHome = Deno.env.get("ZYPHER_HOME");
  if (zypherHome) {
    return zypherHome;
  }

  const homeDir = Deno.env.get("HOME");
  if (!homeDir) {
    throw new Error("Could not determine home directory");
  }
  return path.join(homeDir, ".zypher");
}

/**
 * Gets the default workspace data directory path using Base64 encoding
 * of the working directory path for filesystem safety.
 */
function getDefaultWorkspaceDataDir(
  zypherDir: string,
  workingDirectory: string,
): string {
  // Use Base64 encoding for consistent, filesystem-safe workspace directory names
  const encoder = new TextEncoder();
  const data = encoder.encode(workingDirectory);
  const encodedPath = encodeBase64(data).replace(/[/+]/g, "_").replace(
    /=/g,
    "",
  );

  return path.join(zypherDir, encodedPath);
}

/**
 * Local filesystem adapter using Deno APIs.
 * This is the default adapter for running agents on the local machine.
 */
export class LocalFileSystemAdapter implements FileSystemAdapter {
  readonly workingDirectory: string;
  readonly zypherDir: string;
  readonly workspaceDataDir: string;
  readonly fileAttachmentCacheDir: string;

  constructor(options: LocalFileSystemAdapterOptions) {
    this.workingDirectory = options.workingDirectory;
    this.zypherDir = options.zypherDir ?? getDefaultZypherDir();
    this.workspaceDataDir = options.workspaceDataDir ??
      getDefaultWorkspaceDataDir(this.zypherDir, this.workingDirectory);
    this.fileAttachmentCacheDir = options.fileAttachmentCacheDir ??
      path.join(this.zypherDir, "cache", "files");
  }

  /**
   * Resolve a relative path against the working directory.
   * Absolute paths are returned as-is.
   */
  #resolve(filePath: string): string {
    return path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.workingDirectory, filePath);
  }

  async readTextFile(filePath: string): Promise<string> {
    return await Deno.readTextFile(this.#resolve(filePath));
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    return await Deno.readFile(this.#resolve(filePath));
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    await Deno.writeTextFile(this.#resolve(filePath), content);
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    await Deno.writeFile(this.#resolve(filePath), data);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    await Deno.copyFile(this.#resolve(src), this.#resolve(dest));
  }

  async remove(
    filePath: string,
    options?: { recursive?: boolean },
  ): Promise<void> {
    await Deno.remove(this.#resolve(filePath), options);
  }

  async stat(filePath: string): Promise<FileInfo> {
    const info = await Deno.stat(this.#resolve(filePath));
    return {
      isDirectory: info.isDirectory,
      isFile: info.isFile,
      isSymlink: info.isSymlink,
      size: info.size,
      mtime: info.mtime,
      atime: info.atime,
      birthtime: info.birthtime,
    };
  }

  async *readDir(dirPath: string): AsyncIterable<DirEntry> {
    for await (const entry of Deno.readDir(this.#resolve(dirPath))) {
      yield {
        name: entry.name,
        isDirectory: entry.isDirectory,
        isFile: entry.isFile,
        isSymlink: entry.isSymlink,
      };
    }
  }

  async ensureDir(dirPath: string): Promise<void> {
    await stdEnsureDir(this.#resolve(dirPath));
  }

  async open(filePath: string, options: FileOpenOptions): Promise<FileHandle> {
    const file = await Deno.open(this.#resolve(filePath), options);
    return {
      read: (buffer: Uint8Array) => file.read(buffer),
      close: () => file.close(),
      readable: file.readable,
    };
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await Deno.stat(this.#resolve(filePath));
      return true;
    } catch {
      return false;
    }
  }
}
