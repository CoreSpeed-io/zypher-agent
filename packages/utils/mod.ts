/**
 * Common utilities shared across Zypher packages.
 *
 * Provides helpers for async operations, command execution, environment
 * variables, and error handling.
 *
 * @example
 * ```ts
 * import { Completer, parsePort, createAbortError } from "@zypher/utils";
 * // Or import specific modules:
 * import { Completer } from "@zypher/utils/async";
 * import { parsePort } from "@zypher/utils/env";
 * ```
 *
 * @module
 */

// Async utilities
export { Completer } from "./async.ts";
// Command utilities
export { runCommand } from "./command.ts";

// Environment utilities
export { getRequiredEnv, parsePort } from "./env.ts";
// Error utilities
export { createAbortError, formatError, isAbortError } from "./error.ts";
