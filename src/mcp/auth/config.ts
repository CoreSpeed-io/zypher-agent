import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import { crypto } from "@std/crypto";
import { getWorkspaceDataDir } from "../../utils/data.ts";
import type { z } from "zod";
const ZYPHER_VERSION = "0.1.0";
/**
 * Gets the configuration directory path
 * @returns The path to the configuration directory
 */
export async function getConfigDir(): Promise<string> {
  const baseConfigDir = Deno.env.get("MCP_REMOTE_CONFIG_DIR") ||
    path.join(await getWorkspaceDataDir(), ".mcp-auth");
  // Add a version subdirectory so we don't need to worry about backwards/forwards compatibility yet
  return path.join(baseConfigDir, `ZYPHER_AUTH_${ZYPHER_VERSION}`);
}

/**
 * Ensures the configuration directory exists
 */
export async function ensureConfigDir(): Promise<void> {
  try {
    const configDir = await getConfigDir();
    await ensureDir(configDir);
  } catch (error) {
    console.error("Error creating config directory:", error);
    throw error;
  }
}

/**
 * Gets the file path for a config file
 * @param serverUrlHash The hash of the server URL
 * @param filename The name of the file
 * @returns The absolute file path
 */
export async function getConfigFilePath(
  serverUrlHash: string,
  filename: string,
): Promise<string> {
  const configDir = await getConfigDir();
  return path.join(configDir, `${serverUrlHash}_${filename}`);
}

/**
 * Deletes a config file if it exists
 * @param serverUrlHash The hash of the server URL
 * @param filename The name of the file to delete
 */
export async function deleteConfigFile(
  serverUrlHash: string,
  filename: string,
): Promise<void> {
  try {
    const filePath = await getConfigFilePath(serverUrlHash, filename);
    await Deno.remove(filePath);
  } catch (error) {
    // Ignore if file doesn't exist
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error(`Error deleting ${filename}:`, error);
    }
  }
}

/**
 * Reads a JSON file and parses it with the provided schema
 * @param serverUrlHash The hash of the server URL
 * @param filename The name of the file to read
 * @param schema The schema to validate against
 * @returns The parsed file content or undefined if the file doesn't exist
 */
export async function readJsonFile<T>(
  serverUrlHash: string,
  filename: string,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  try {
    await ensureConfigDir();

    const filePath = await getConfigFilePath(serverUrlHash, filename);
    const content = await Deno.readTextFile(filePath);
    const result = await schema.parseAsync(JSON.parse(content));
    // console.log({ filename: result })
    return result;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // console.log(`File ${filename} does not exist`)
      return undefined;
    }
    console.error(`Error reading ${filename}:`, error);
    return undefined;
  }
}

/**
 * Writes a JSON object to a file
 * @param serverUrlHash The hash of the server URL
 * @param filename The name of the file to write
 * @param data The data to write
 */
export async function writeJsonFile(
  serverUrlHash: string,
  filename: string,
  data: unknown,
): Promise<void> {
  try {
    await ensureConfigDir();
    const filePath = await getConfigFilePath(serverUrlHash, filename);
    await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
    throw error;
  }
}

/**
 * Reads a text file
 * @param serverUrlHash The hash of the server URL
 * @param filename The name of the file to read
 * @param errorMessage Optional custom error message
 * @returns The file content as a string
 */
export async function readTextFile(
  serverUrlHash: string,
  filename: string,
  errorMessage?: string,
): Promise<string> {
  try {
    await ensureConfigDir();
    const filePath = await getConfigFilePath(serverUrlHash, filename);
    return await Deno.readTextFile(filePath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(errorMessage || `File not found: ${filename}`);
    }
    throw new Error(errorMessage || `Error reading ${filename}`);
  }
}

/**
 * Writes a text string to a file
 * @param serverUrlHash The hash of the server URL
 * @param filename The name of the file to write
 * @param text The text to write
 */
export async function writeTextFile(
  serverUrlHash: string,
  filename: string,
  text: string,
): Promise<void> {
  try {
    await ensureConfigDir();
    const filePath = await getConfigFilePath(serverUrlHash, filename);
    await Deno.writeTextFile(filePath, text);
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
    throw error;
  }
}

export async function getServerUrlHash(serverUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "MD5",
    new TextEncoder().encode(serverUrl),
  );
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
