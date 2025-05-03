/**
 * Generate a unique file ID that can be used across different storage implementations
 * @returns A unique string that will serve as the unique file identifier
 */
export function generateFileId(): string {
  return crypto.randomUUID();
}
