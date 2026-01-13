/**
 * Shell provides an abstraction over command execution,
 * enabling tools to run commands in various environments (local, E2B, Cloudflare, etc.)
 *
 * @module
 */

/**
 * Output from a command execution.
 */
export interface CommandOutput {
  /** Whether the command executed successfully (exit code 0) */
  success: boolean;
  /** Exit code of the command */
  code: number;
  /** Standard output as bytes */
  stdout: Uint8Array;
  /** Standard error as bytes */
  stderr: Uint8Array;
}

/**
 * Options for executing a command.
 */
export interface CommandOptions {
  /** Arguments to pass to the command */
  args?: string[];
  /** Working directory to execute the command in */
  cwd?: string;
  /** Environment variables to set for the command */
  env?: Record<string, string>;
  /** Standard input to pass to the command */
  stdin?: Uint8Array;
}

/**
 * Abstract shell interface for command execution.
 *
 * Implementations can target:
 * - Local shell (Deno)
 * - E2B cloud sandbox
 * - SSH connections
 * - Any other environment with command execution capabilities
 */
export interface Shell {
  /**
   * Execute a command and return its output.
   * @param command - The command to run (e.g., "git", "rg", "fd")
   * @param options - Command options including args, cwd, env
   * @returns Command output including stdout, stderr, and exit code
   */
  execute(command: string, options?: CommandOptions): Promise<CommandOutput>;

  /**
   * Check if a command is available in this environment.
   * @param command - The command to check (e.g., "git", "rg")
   * @returns true if the command is available and can be executed
   */
  isAvailable(command: string): Promise<boolean>;
}
