/**
 * Formats an error into a consistent string message
 * @param error - The error to format
 * @returns A string representation of the error
 */
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
