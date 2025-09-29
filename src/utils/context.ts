import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import { encodeBase64 } from "@std/encoding/base64";
import type { ZypherContext } from "../ZypherAgent.ts";

/**
 * Creates a ZypherContext for the given working directory.
 * This function consolidates the workspace directory creation logic
 * that was previously duplicated across the codebase.
 *
 * @param workingDirectory Absolute path to the working directory
 * @param customZypherDir Optional custom zypher directory (defaults to ~/.zypher)
 * @param userId Optional user identifier for tracking usage history
 * @param fileAttachmentCacheDir Optional custom directory for file attachment cache
 * @returns Promise resolving to ZypherContext with concrete directory paths
 */
export async function createZypherContext(
  workingDirectory: string,
  customZypherDir?: string,
  userId?: string,
  fileAttachmentCacheDir?: string,
): Promise<ZypherContext> {
  // Create the base zypher directory
  const zypherDir = customZypherDir ?? getDefaultZypherDir();

  try {
    await ensureDir(zypherDir);
  } catch (error) {
    console.warn("Failed to create zypher directory:", error);
  }

  // Generate workspace data directory using Base64 encoding
  const workspaceDataDir = generateWorkspaceDataDir(
    zypherDir,
    workingDirectory,
  );

  try {
    await ensureDir(workspaceDataDir);
  } catch (error) {
    console.warn("Failed to create workspace data directory:", error);
  }

  return {
    workingDirectory,
    zypherDir,
    workspaceDataDir,
    userId,
    fileAttachmentCacheDir: fileAttachmentCacheDir ??
      path.join(zypherDir, "cache", "files"),
  };
}

/**
 * Gets the default zypher directory (~/.zypher)
 */
function getDefaultZypherDir(): string {
  const homeDir = Deno.env.get("HOME");
  if (!homeDir) {
    throw new Error("Could not determine home directory");
  }
  return path.join(homeDir, ".zypher");
}

/**
 * Generates the workspace data directory path using Base64 encoding
 * of the working directory path for filesystem safety.
 */
function generateWorkspaceDataDir(
  zypherDir: string,
  workingDirectory: string,
): string {
  if (!workingDirectory) {
    throw new Error("Working directory cannot be empty");
  }

  // Use Base64 encoding for consistent, filesystem-safe workspace directory names
  const encoder = new TextEncoder();
  const data = encoder.encode(workingDirectory);
  const encodedPath = encodeBase64(data).replace(/[/+]/g, "_").replace(
    /=/g,
    "",
  );

  return path.join(zypherDir, encodedPath);
}
