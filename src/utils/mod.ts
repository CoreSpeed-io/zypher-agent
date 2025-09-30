export * from "./data.ts";
export * from "./cli.ts";
export * from "./prompt.ts";
export * from "./completer.ts";
export * from "./EmittingMessageArray.ts";

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
