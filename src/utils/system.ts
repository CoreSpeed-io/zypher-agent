import os from "os";
import process from "process";

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
    shell: process.env.SHELL ?? "/bin/bash",
  };
}
