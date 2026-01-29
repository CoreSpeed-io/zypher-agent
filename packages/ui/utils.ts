/**
 * Convert an HTTP(S) URL to a WebSocket URL.
 * - `http://` becomes `ws://`
 * - `https://` becomes `wss://`
 * @throws {TypeError} If the URL is invalid
 */
export function toWebSocketUrl(httpUrl: string): string {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}
