/**
 * Utilities for executing shell commands with error handling.
 *
 * @example
 * ```ts
 * import { runCommand } from "@zypher/utils/command";
 *
 * const output = await runCommand("git", { args: ["status"] });
 * ```
 *
 * @module
 */

/**
 * Runs a command and throws if it fails.
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
