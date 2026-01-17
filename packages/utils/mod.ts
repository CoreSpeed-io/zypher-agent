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

// Error utilities
export { createAbortError, formatError, isAbortError } from "./error.ts";

// Async utilities
export { Completer } from "./async.ts";

// Environment utilities
export { getRequiredEnv, parsePort } from "./env.ts";

// Command utilities
export { runCommand } from "./command.ts";
