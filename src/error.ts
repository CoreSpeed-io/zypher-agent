/**
 * Custom error class for abort operations
 */
export class AbortError extends Error {
  constructor(message = "The operation was aborted") {
    super(message);
    this.name = "AbortError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof AbortError ||
    (
      error instanceof Error &&
      (
        error.name === "AbortError" ||
        error.message.includes("abort")
      )
    );
}

/**
 * Formats an error into a consistent string message
 * @param error - The error to format
 * @returns A string representation of the error
 */
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
