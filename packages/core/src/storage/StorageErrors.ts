/**
 * Base error class for storage-related errors
 */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error thrown when a file does not exist, cannot be found, or has expired
 */
export class FileNotFoundError extends StorageError {
  constructor(fileId: string, reason?: string) {
    const message = reason
      ? `File ${fileId} not found or expired: ${reason}`
      : `File ${fileId} not found or expired`;
    super(message);
  }
}
