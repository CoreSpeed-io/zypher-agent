// Safe port parsing function
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
