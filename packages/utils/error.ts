/**
 * Utilities for creating, detecting, and formatting errors.
 *
 * @example
 * ```ts
 * import { createAbortError, isAbortError, formatError } from "@zypher/utils/error";
 *
 * throw createAbortError("Operation cancelled");
 * ```
 *
 * @module
 */

/**
 * Create a standard AbortError using DOMException.
 *
 * @param message - The error message
 * @returns A DOMException with name "AbortError"
 */
export function createAbortError(
  message = "The operation was aborted",
): DOMException {
  return new DOMException(message, "AbortError");
}

/**
 * Check if an error is an abort error.
 *
 * @param error - The error to check
 * @returns true if the error is an abort error
 */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("abort")))
  );
}

/**
 * Formats an error into a consistent string message.
 *
 * @param error - The error to format
 * @returns A string representation of the error
 */
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
