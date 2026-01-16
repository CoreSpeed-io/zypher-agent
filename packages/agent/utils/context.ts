import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import { encodeBase64 } from "@std/encoding/base64";
import type { ZypherContext } from "../zypher_agent.ts";

/**
 * Creates a ZypherContext for the given working directory.
 * This function consolidates the workspace directory creation logic
 * that was previously duplicated across the codebase.
 *
 * @param workingDirectory Absolute path to the working directory
 * @param options Optional configuration to override default ZypherContext values
 * @returns Promise resolving to ZypherContext with concrete directory paths
 */
export async function createZypherContext(
  workingDirectory: string,
  options?: Partial<Omit<ZypherContext, "workingDirectory">>,
): Promise<ZypherContext> {
  // Create the base zypher directory
  const zypherDir = options?.zypherDir ?? getDefaultZypherDir();
  await ensureDir(zypherDir);

  // Generate workspace data directory using Base64 encoding (unless overridden)
  const workspaceDataDir = options?.workspaceDataDir ??
    getDefaultWorkspaceDataDir(
      zypherDir,
      workingDirectory,
    );
  await ensureDir(workspaceDataDir);

  const fileAttachmentCacheDir = options?.fileAttachmentCacheDir ??
    path.join(zypherDir, "cache", "files");
  await ensureDir(fileAttachmentCacheDir);

  const skillsDir = options?.skillsDir ?? path.join(zypherDir, "skills");

  return {
    workingDirectory,
    zypherDir,
    workspaceDataDir,
    fileAttachmentCacheDir,
    skillsDir,
    userId: options?.userId,
  };
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
