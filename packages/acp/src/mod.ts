/**
 * ACP (Agent Client Protocol) Module
 *
 * Provides ACP protocol support for Zypher Agent, enabling integration
 * with ACP-compatible clients like Zed Editor.
 *
 * Uses the official @agentclientprotocol/sdk for protocol handling.
 *
 * Run directly as CLI:
 *   deno run -A jsr:@zypher/acp
 *
 * @module
 */

export { type AcpServer, acpStdioServer } from "./server.ts";
export type { ZypherAgentBuilder } from "./adapter.ts";

if (import.meta.main) {
  const { main } = await import("./main.ts");
  main();
}
