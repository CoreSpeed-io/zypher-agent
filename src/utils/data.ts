import * as path from "@std/path";
import type { Message } from "../message.ts";
import { isMessage } from "../message.ts";
import { formatError } from "../error.ts";
import type { ZypherContext } from "../ZypherAgent.ts";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["zypher", "utils"]);

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
 * Loads the message history for the current workspace.
 * Each workspace has its own message history file based on its path.
 *
 * @returns {Promise<Message[]>} Array of messages from history, empty array if no history exists
 */
export async function loadMessageHistory(
  context: ZypherContext,
): Promise<Message[]> {
  try {
    const historyPath = path.join(context.workspaceDataDir, "history.json");

    // Check if file exists before trying to read it
    if (!(await fileExists(historyPath))) {
      return [];
    }

    const content = await Deno.readTextFile(historyPath);
    const parsedData: unknown = JSON.parse(content);

    // Validate that parsedData is an array
    if (!Array.isArray(parsedData)) {
      logger.warn("Message history is not an array, returning empty array");
      return [];
    }

    // Filter out invalid messages using the isMessage type guard
    const messages: Message[] = parsedData.filter((item): item is Message => {
      const valid = isMessage(item);
      if (!valid) {
        logger.warn(
          "Found invalid message in history, filtering it out: {item}",
          {
            item,
          },
        );
      }
      return valid;
    });

    return messages;
  } catch (error) {
    logger.warn(
      `Failed to load message history: ${
        formatError(error)
      }, falling back to empty history`,
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
export async function saveMessageHistory(
  messages: Message[],
  context: ZypherContext,
): Promise<void> {
  const historyPath = path.join(context.workspaceDataDir, "history.json");
  await Deno.writeTextFile(historyPath, JSON.stringify(messages, null, 2));
}
