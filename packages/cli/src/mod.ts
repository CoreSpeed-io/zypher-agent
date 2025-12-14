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

export { runAgentInTerminal } from "./terminal.ts";

if (import.meta.main) {
  const { main } = await import("./main.ts");
  main();
}
