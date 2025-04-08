/**
 * Safely converts a value to string, handling different types appropriately
 *
 * @param value - The value to convert to string
 * @returns The string representation of the value
 */
function safeToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  // At this point, value can only be number, boolean, bigint, or symbol
  return (value as number | boolean | bigint | symbol).toString();
}

/**
 * Safely extracts error output from an error object
 *
 * @param {unknown} error - The error object
 * @param {(output: string) => string} filterFn - Function to filter the output
 * @returns {string} The filtered error output
 */
export function extractErrorOutput(
  error: unknown,
  filterFn: (output: string) => string,
): string {
  let errorOutput = "";

  if (error && typeof error === "object") {
    // Extract stdout if available
    if ("stdout" in error) {
      const stdout = safeToString(error.stdout);
      const filteredStdout = filterFn(stdout);
      if (filteredStdout) errorOutput += filteredStdout;
    }

    // Extract stderr if available
    if ("stderr" in error) {
      const stderr = safeToString(error.stderr);
      const filteredStderr = filterFn(stderr);
      if (filteredStderr) {
        errorOutput += (errorOutput ? "\n" : "") + filteredStderr;
      }
    }

    // Extract message if available and no other output found
    if (!errorOutput && "message" in error) {
      const message = safeToString(error.message);
      const filteredMessage = filterFn(message);
      if (filteredMessage) errorOutput = filteredMessage;
    }
  }

  return errorOutput;
}
