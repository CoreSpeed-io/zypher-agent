import os from "node:os";
import { mkdir, access, constants, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Message } from "../message.ts";
import { isMessage } from "../message.ts";
import { formatError } from "./error.ts";

/**
 * Checks if a file exists and is readable.
 *
 * @param {string} path - Path to the file to check
 * @returns {Promise<boolean>} True if file exists and is readable, false otherwise
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
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
export async function getDataDir(): Promise<string> {
  const homeDir = os.homedir();
  const dataDir = join(homeDir, ".zypher");

  try {
    await mkdir(dataDir, { recursive: true });
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
export async function getWorkspaceDataDir(): Promise<string> {
  const dataDir = await getDataDir();

  // Create workspace-specific directory
  const workspaceHash = Buffer.from(process.cwd()).toString("base64url");
  const workspaceDir = join(dataDir, workspaceHash);

  try {
    await mkdir(workspaceDir, { recursive: true });
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
export async function loadMessageHistory(): Promise<Message[]> {
  try {
    const workspaceDir = await getWorkspaceDataDir();
    const historyPath = join(workspaceDir, "history.json");

    // Check if file exists before trying to read it
    if (!(await fileExists(historyPath))) {
      return [];
    }

    const content = await readFile(historyPath, "utf-8");
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
export async function saveMessageHistory(messages: Message[]): Promise<void> {
  try {
    const workspaceDir = await getWorkspaceDataDir();
    const historyPath = join(workspaceDir, "history.json");

    await writeFile(historyPath, JSON.stringify(messages, null, 2));
  } catch (error) {
    console.warn(`Failed to save message history: ${formatError(error)}`);
  }
}
