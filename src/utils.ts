import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import os from 'os';
import process from 'process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

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
    shell: process.env.SHELL || '/bin/bash',
  };
}

/**
 * Gets the path to the Zypher data directory.
 * Creates the directory if it doesn't exist.
 * 
 * @returns {Promise<string>} Path to the Zypher data directory
 * @private
 */
async function getDataDir(): Promise<string> {
  const homeDir = os.homedir();
  const dataDir = join(homeDir, '.zypher');

  try {
    await mkdir(dataDir, { recursive: true });
  } catch (error) {
    console.warn('Failed to create data directory:', error);
  }

  return dataDir;
}

/**
 * Loads the message history for the current workspace.
 * Each workspace has its own message history file based on its path.
 * 
 * @returns {Promise<MessageParam[]>} Array of messages from history, empty array if no history exists
 */
export async function loadMessageHistory(): Promise<MessageParam[]> {
  try {
    const dataDir = await getDataDir();
    const workspaceHash = Buffer.from(process.cwd()).toString('base64url');
    const historyPath = join(dataDir, `history_${workspaceHash}.json`);

    const content = await readFile(historyPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('Failed to load message history:', error);
    return [];
  }
}

/**
 * Saves the message history for the current workspace.
 * Creates a new history file if it doesn't exist, or updates the existing one.
 * 
 * @param {MessageParam[]} messages - Array of messages to save
 * @returns {Promise<void>}
 */
export async function saveMessageHistory(messages: MessageParam[]): Promise<void> {
  try {
    const dataDir = await getDataDir();
    const workspaceHash = Buffer.from(process.cwd()).toString('base64url');
    const historyPath = join(dataDir, `history_${workspaceHash}.json`);

    await writeFile(historyPath, JSON.stringify(messages, null, 2), 'utf-8');
  } catch (error) {
    console.warn('Failed to save message history:', error);
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
export function printMessage(message: MessageParam): void {
  console.log(`\n🗣️ Role: ${message.role}`);
  console.log('════════════════════');

  const content = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content, citations: [] }];

  for (const block of content) {
    if (block.type === 'text') {
      console.log(block.text);
    } else if (block.type === 'tool_use' && 'name' in block && 'input' in block) {
      console.log(`🔧 Using tool: ${block.name}`);
      console.log('Parameters:', JSON.stringify(block.input, null, 2));
    } else if (block.type === 'tool_result' && 'content' in block) {
      console.log('📋 Tool result:');
      console.log(block.content);
    } else {
      console.log('Unknown block type:', block);
    }
    console.log('---');
  }
} 