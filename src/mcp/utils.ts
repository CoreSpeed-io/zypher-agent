/**
 * MCP Utility Functions
 *
 * This file contains utility functions for MCP-related operations.
 * Uses standard libraries and packages instead of custom implementations.
 */

// Note: Most OAuth and PKCE functionality should use the openid-client package
// which is already included in the project dependencies.

/**
 * Find an available port dynamically
 * This is the only function currently used by the codebase
 * @param startPort The port to start searching from
 * @returns A promise that resolves to an available port
 */
export function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    // Try to find an available port by attempting to listen on it
    let port = startPort;
    const tryPort = () => {
      try {
        const listener = Deno.listen({ port });
        listener.close();
        resolve(port);
      } catch {
        port++;
        if (port > startPort + 1000) {
          // If we can't find an available port, use a default
          console.warn(
            `Could not find an available port, using default: ${
              startPort + 1000
            }`,
          );
          resolve(startPort + 1000);
        } else {
          tryPort();
        }
      }
    };
    tryPort();
  });
}

/**
 * EXAMPLES: How to use standard libraries for common utility functions
 *
 * 1. Random String Generation:
 *    import { v4 } from "@std/uuid";
 *    const randomString = v4.generate().replace(/-/g, '');
 *    // OR use Web Crypto API:
 *    const randomString = crypto.randomUUID().replace(/-/g, '');
 *
 * 2. PKCE Code Challenge (use openid-client instead):
 *    import * as client from "openid-client";
 *    const codeVerifier = client.randomPKCECodeVerifier();
 *    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
 *
 * 3. Base64 Encoding (use @std/encoding):
 *    import { encodeBase64 } from "@std/encoding/base64";
 *    const encoded = encodeBase64(new TextEncoder().encode("data"));
 *
 * 4. Basic Auth Header:
 *    import { encodeBase64 } from "@std/encoding/base64";
 *    const credentials = `${clientId}:${clientSecret}`;
 *    const authHeader = `Basic ${encodeBase64(new TextEncoder().encode(credentials))}`;
 */
