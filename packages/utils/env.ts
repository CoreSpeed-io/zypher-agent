/**
 * Utilities for reading and parsing environment variables.
 *
 * @example
 * ```ts
 * import { parsePort, getRequiredEnv } from "@zypher/utils/env";
 *
 * const port = parsePort(Deno.env.get("PORT"), 8080);
 * const apiKey = getRequiredEnv("API_KEY");
 * ```
 *
 * @module
 */

/**
 * Parses a port string into a valid port number.
 *
 * @param port - The port string to parse (e.g., from environment variable)
 * @param defaultPort - The fallback port if parsing fails or port is invalid
 * @returns A valid port number between 1 and 65535, or the default port
 *
 * @example
 * ```ts
 * parsePort(Deno.env.get("PORT"), 8080)  // Returns PORT env value or 8080
 * parsePort("3000", 8080)                 // Returns 3000
 * parsePort("invalid", 8080)              // Returns 8080
 * parsePort(undefined, 8080)              // Returns 8080
 * ```
 */
export function parsePort(
  port: string | undefined,
  defaultPort: number,
): number {
  if (!port) return defaultPort;

  const parsedPort = parseInt(port, 10);
  if (isNaN(parsedPort)) return defaultPort;

  // Valid port numbers are between 1 and 65535
  if (parsedPort < 1 || parsedPort > 65535) return defaultPort;

  return parsedPort;
}

/**
 * Gets a required environment variable, throwing an error if not set.
 *
 * @param name - The name of the environment variable
 * @returns The value of the environment variable
 * @throws Error if the environment variable is not set
 *
 * @example
 * ```ts
 * const apiKey = getRequiredEnv("API_KEY");  // Throws if API_KEY is not set
 * ```
 */
export function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value == undefined) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}
