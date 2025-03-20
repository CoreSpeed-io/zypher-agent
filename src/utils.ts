import os from "os";
import process from "process";
import { readFile, writeFile, mkdir, access, constants } from "fs/promises";
import { join } from "path";
import type { Message } from "./message";

/**
 * Information about the user's system environment.
 */
export interface UserInfo {
  /** The operating system version (e.g., 'darwin 24.3.0') */
  osVersion: string;
  /** The absolute path of the current working directory */
  workspacePath: string;
  /** The user's shell (e.g., '/bin/zsh') */
  shell: string;
}

/**
 * Gets information about the current user's system environment.
 *
 * @returns {UserInfo} Object containing OS version, workspace path, and shell information
 *
 * @example
 * const userInfo = getCurrentUserInfo();
 * console.log(userInfo.osVersion); // 'darwin 24.3.0'
 */
export function getCurrentUserInfo(): UserInfo {
  return {
    osVersion: `${os.platform()} ${os.release()}`,
    workspacePath: process.cwd(),
    shell: process.env.SHELL || "/bin/bash",
  };
}

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
    return JSON.parse(content);
  } catch (error) {
    console.warn(
      `Failed to load message history: ${error instanceof Error ? error.message : String(error)}`,
    );
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
    console.warn(
      `Failed to save message history: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Prints a message from the agent's conversation to the console with proper formatting.
 * Handles different types of message blocks including text, tool use, and tool results.
 *
 * @param {MessageParam} message - The message to print
 *
 * @example
 * printMessage({
 *   role: 'assistant',
 *   content: 'Hello, how can I help you?'
 * });
 *
 * printMessage({
 *   role: 'user',
 *   content: [{
 *     type: 'tool_result',
 *     tool_use_id: '123',
 *     content: 'Tool execution result'
 *   }]
 * });
 */
export function printMessage(message: Message): void {
  console.log(`\n🗣️ Role: ${message.role}`);
  console.log("════════════════════");

  const content = Array.isArray(message.content)
    ? message.content
    : [{ type: "text", text: message.content, citations: [] }];

  for (const block of content) {
    if (block.type === "text") {
      console.log(block.text);
    } else if (
      block.type === "tool_use" &&
      "name" in block &&
      "input" in block
    ) {
      console.log(`🔧 Using tool: ${block.name}`);
      console.log("Parameters:", JSON.stringify(block.input, null, 2));
    } else if (block.type === "tool_result" && "content" in block) {
      console.log("📋 Tool result:");
      console.log(block.content);
    } else {
      console.log("Unknown block type:", block);
    }
    console.log("---");
  }
}
