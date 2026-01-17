import * as path from "@std/path";
import { exists } from "@std/fs";
import type { Message } from "../message.ts";
import { isMessage } from "../message.ts";
import type { ZypherContext } from "../zypher_agent.ts";

/**
 * Loads the message history for the current workspace.
 * Each workspace has its own message history file based on its path.
 *
 * @returns {Promise<Message[]>} Array of messages from history, empty array if no history exists
 * @throws {Error} If the history file exists but cannot be read or parsed
 */
export async function loadMessageHistory(
  context: ZypherContext,
): Promise<Message[]> {
  const historyPath = path.join(context.workspaceDataDir, "history.json");

  // Check if file exists before trying to read it
  if (!(await exists(historyPath))) {
    return [];
  }

  const content = await Deno.readTextFile(historyPath);
  const parsedData: unknown = JSON.parse(content);

  // Validate that parsedData is an array
  if (!Array.isArray(parsedData)) {
    return [];
  }

  // Filter out invalid messages using the isMessage type guard
  return parsedData.filter((item): item is Message => isMessage(item));
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
  context: ZypherContext,
): Promise<void> {
  const historyPath = path.join(context.workspaceDataDir, "history.json");
  await Deno.writeTextFile(historyPath, JSON.stringify(messages, null, 2));
}
