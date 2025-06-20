export * from "./data.ts";
export * from "./completer.ts";

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
    osVersion: `${Deno.build.os} ${Deno.osRelease()}`,
    workspacePath: Deno.cwd(),
    shell: Deno.env.get("SHELL") ?? "/bin/bash",
  };
}

/**
 * Safely runs a command and guarantees it returns its output,
 * throwing an error if it fails.
 *
 * @param command The command to run
 * @param options Command options
 * @returns Command output
 * @throws Error if the command fails
 */
export async function runCommand(
  command: string,
  options?: Deno.CommandOptions,
): Promise<Deno.CommandOutput> {
  const output = await new Deno.Command(command, options).output();
  if (!output.success) {
    throw new Error(`Command failed with exit code ${output.code}: ${command}`);
  }
  return output;
}
