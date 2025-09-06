import * as path from "@std/path";
import { encodeBase64 } from "@std/encoding/base64";
import type { Message } from "../message.ts";
import { isMessage } from "../message.ts";
import { formatError } from "../error.ts";
import { ensureDir } from "@std/fs";

/**
 * Checks if a file exists and is readable.
 *
 * @param {string} path - Path to the file to check
 * @returns {Promise<boolean>} True if file exists and is readable, false otherwise
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the path to the Zypher data directory.
 * Creates the directory if it doesn't exist.
 *
 * @returns {Promise<string>} Path to the Zypher data directory
 */
export async function getZypherDir(): Promise<string> {
  const homeDir = Deno.env.get("HOME");
  if (!homeDir) {
    throw new Error("Could not determine home directory");
  }
  const dataDir = path.join(homeDir, ".zypher");

  try {
    await ensureDir(dataDir);
  } catch (error) {
    console.warn("Failed to create data directory:", error);
  }

  return dataDir;
}

/**
 * Gets the path to the workspace-specific directory within the Zypher data directory.
 * Creates the directory if it doesn't exist.
 *
 * @returns {Promise<string>} Path to the workspace-specific directory
 */
export async function getWorkspaceDataDir(
  walkpath?: string,
): Promise<string> {
  const dataDir = await getZypherDir();

  // Create workspace-specific directory
  const workspacePath = walkpath ?? Deno.cwd();
  const workspaceHash = encodeBase64(workspacePath);
  const workspaceDir = path.join(dataDir, workspaceHash);

  try {
    await ensureDir(workspaceDir);
  } catch (error) {
    console.warn("Failed to create workspace directory:", error);
  }

  return workspaceDir;
}

/**
 * Loads the message history for the current workspace.
 * Each workspace has its own message history file based on its path.
 *
 * @returns {Promise<Message[]>} Array of messages from history, empty array if no history exists
 */
export async function loadMessageHistory(
  walkpath?: string,
): Promise<Message[]> {
  try {
    const workspaceDir = await getWorkspaceDataDir(walkpath);
    const historyPath = path.join(workspaceDir, "history.json");

    // Check if file exists before trying to read it
    if (!(await fileExists(historyPath))) {
      return [];
    }

    const content = await Deno.readTextFile(historyPath);
    const parsedData: unknown = JSON.parse(content);

    // Validate that parsedData is an array
    if (!Array.isArray(parsedData)) {
      console.warn("Message history is not an array, returning empty array");
      return [];
    }

    // Filter out invalid messages using the isMessage type guard
    const messages: Message[] = parsedData.filter((item): item is Message => {
      const valid = isMessage(item);
      if (!valid) {
        console.warn(
          "Found invalid message in history, filtering it out:",
          item,
        );
      }
      return valid;
    });

    return messages;
  } catch (error) {
    console.warn(`Failed to load message history: ${formatError(error)}`);
    return [];
  }
}

/**
 * Saves the message history for the current workspace.
 * Creates a new history file if it doesn't exist, or updates the existing one.
 *
 * @param {Message[]} messages - Array of messages to save
 * @returns {Promise<void>}
 */
export async function saveMessageHistory(
  messages: Message[],
  walkpath?: string,
): Promise<void> {
  try {
    const workspaceDir = await getWorkspaceDataDir(walkpath);
    const historyPath = path.join(workspaceDir, "history.json");

    await Deno.writeTextFile(historyPath, JSON.stringify(messages, null, 2));
  } catch (error) {
    console.warn(`Failed to save message history: ${formatError(error)}`);
  }
}
