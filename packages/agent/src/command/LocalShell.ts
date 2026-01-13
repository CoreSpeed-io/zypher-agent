/**
 * LocalShell provides a local command execution implementation
 * using Deno APIs.
 *
 * @module
 */

import type { CommandOptions, CommandOutput, Shell } from "./Shell.ts";

/**
 * Local shell implementation using Deno.Command.
 * This is the default shell for running agents on the local machine.
 */
export class LocalShell implements Shell {
  async execute(
    command: string,
    options?: CommandOptions,
  ): Promise<CommandOutput> {
    const cmd = new Deno.Command(command, {
      args: options?.args,
      cwd: options?.cwd,
      env: options?.env,
      stdin: options?.stdin ? "piped" : undefined,
    });

    const process = cmd.spawn();

    // Write stdin if provided
    if (options?.stdin && process.stdin) {
      const writer = process.stdin.getWriter();
      await writer.write(options.stdin);
      await writer.close();
    }

    const output = await process.output();

    return {
      success: output.success,
      code: output.code,
      stdout: output.stdout,
      stderr: output.stderr,
    };
  }

  async isAvailable(command: string): Promise<boolean> {
    try {
      // Use 'which' on Unix-like systems to check if command exists
      const result = await this.execute("which", { args: [command] });
      return result.success;
    } catch {
      return false;
    }
  }
}
