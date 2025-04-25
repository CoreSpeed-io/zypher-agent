import * as uuid from "@std/uuid";

/**
 * Generate a unique file ID that can be used across different storage implementations
 * @returns A UUID v5 string that will serve as the unique file identifier
 */
export async function generateFileId(): Promise<string> {
  const name = new TextEncoder().encode("usercontent.deckspeed.com");
  return await uuid.v5.generate(uuid.NAMESPACE_DNS, name);
}
