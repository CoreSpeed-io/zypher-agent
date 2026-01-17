/**
 * CLI utilities for running Zypher Agent in terminal environments.
 *
 * @example Run as CLI
 * ```bash
 * deno run -A jsr:@zypher/cli -k YOUR_API_KEY
 * ```
 *
 * @example Import as library
 * ```typescript
 * import { runAgentInTerminal } from "@zypher/cli";
 * ```
 *
 * @module
 */

export { printMessage } from "./print_message.ts";
export { runAgentInTerminal } from "./run_agent_in_terminal.ts";
export { CliOAuthCallbackHandler } from "./cli_oauth_callback_handler.ts";

if (import.meta.main) {
  const { main } = await import("./main.ts");
  main();
}
