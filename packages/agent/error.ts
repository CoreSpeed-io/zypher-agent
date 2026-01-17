export { createAbortError, formatError, isAbortError } from "@zypher/utils";

/**
 * Custom error class for task concurrency issues.
 * Thrown when attempting to run a new task while another task is already running.
 */
export class TaskConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskConcurrencyError";
  }
}
