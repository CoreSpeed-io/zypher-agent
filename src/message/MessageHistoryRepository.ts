import type { Message } from "./Message.ts";

/**
 * Repository interface for storing and retrieving message history.
 *
 * This abstraction allows applications to customize how conversation history
 * is persisted - whether in JSON files, databases, remote storage, or in-memory.
 */
export interface MessageHistoryRepository {
  /**
   * Load the complete message history for the configured workspace.
   *
   * @returns Promise resolving to array of messages, empty array if no history exists
   */
  load(): Promise<Message[]>;

  /**
   * Save the complete message history for the configured workspace.
   * This typically replaces the entire history.
   *
   * @param messages Array of messages to save
   */
  save(messages: Message[]): Promise<void>;

  /**
   * Clear all message history for the configured workspace.
   */
  clear(): Promise<void>;

  /**
   * Note: We intentionally do not provide an `append` method because:
   * 1. It cannot guarantee consistency with the persisted state
   * 2. It's prone to race conditions in concurrent environments
   * 3. Message history can be modified (truncated, edited) making append unsafe
   *
   * Instead, always use the load -> modify -> save pattern for safe updates.
   */
}
