/**
 * MCP Utility Functions
 *
 * This file contains utility functions for MCP-related operations.
 */

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
