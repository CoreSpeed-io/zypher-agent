/**
 * MCP Utility Functions
 *
 * This file contains utility functions for MCP-related operations.
 */

/**
 * Generate a random string for PKCE and state parameters
 * @param length The length of the random string to generate
 * @returns A random string of the specified length
 */
export function generateRandomString(length: number): string {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

/**
 * Generate a code challenge for PKCE
 * @param codeVerifier The code verifier to generate a challenge for
 * @returns A base64url-encoded code challenge
 */
export async function generateCodeChallenge(
  codeVerifier: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);

  // Base64url encode the digest
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Find an available port dynamically
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
 * Encode client credentials for Basic Authentication
 * @param clientId The client ID
 * @param clientSecret The client secret
 * @returns A Base64-encoded string for use in the Authorization header
 */
export function encodeClientCredentials(
  clientId: string,
  clientSecret: string,
): string {
  const credentials = `${encodeURIComponent(clientId)}:${
    encodeURIComponent(clientSecret)
  }`;
  return btoa(credentials);
}

/**
 * Create an HTTP Basic Authentication header
 * @param clientId The client ID
 * @param clientSecret The client secret
 * @returns The full Authorization header value
 */
export function createBasicAuthHeader(
  clientId: string,
  clientSecret: string,
): string {
  return `Basic ${encodeClientCredentials(clientId, clientSecret)}`;
}
