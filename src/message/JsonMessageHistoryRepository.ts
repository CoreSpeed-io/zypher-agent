import * as path from "@std/path";
import type { Message } from "./Message.ts";
import { isMessage } from "./Message.ts";
import { formatError } from "../error.ts";
import type { MessageHistoryRepository } from "./MessageHistoryRepository.ts";
import type { ZypherContext } from "../ZypherAgent.ts";
import { fileExists } from "../utils/data.ts";

/**
 * JSON file-based implementation of MessageHistoryRepository.
 * Uses ZypherContext for workspace directory management to eliminate code duplication.
 *
 * This implementation maintains backward compatibility with the existing
 * message history format and file locations.
 */
export class JsonMessageHistoryRepository implements MessageHistoryRepository {
  #historyPath: string;

  /**
   * Create a new JSON message history repository.
   *
   * @param context ZypherContext containing workspace directory configuration
   */
  constructor(private readonly context: ZypherContext) {
    this.#historyPath = path.join(
      this.context.workspaceDataDir,
      "history.json",
    );
  }

  async load(): Promise<Message[]> {
    try {
      // Check if file exists before trying to read it
      if (!(await fileExists(this.#historyPath))) {
        return [];
      }

      const content = await Deno.readTextFile(this.#historyPath);
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

  async save(messages: Message[]): Promise<void> {
    await Deno.writeTextFile(
      this.#historyPath,
      JSON.stringify(messages, null, 2),
    );
  }

  async clear(): Promise<void> {
    if (await fileExists(this.#historyPath)) {
      await Deno.remove(this.#historyPath);
    }
  }
}
