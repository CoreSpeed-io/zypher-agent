import type { OAuthCallbackHandler } from "@zypher/agent";

/**
 * CLI-based OAuth callback handler
 *
 * This handler prompts the user to paste the callback URL after completing
 * the OAuth authorization in their browser. It extracts the authorization
 * code from the callback URL parameters.
 */
export class CliOAuthCallbackHandler implements OAuthCallbackHandler {
  waitForCallback(): Promise<string> {
    const input = prompt("After authorization, paste the callback URL here: ");

    if (!input?.trim()) {
      throw new Error("No callback URL provided");
    }

    // Parse the callback URL to extract authorization code
    let callbackUrl: URL;
    try {
      callbackUrl = new URL(input.trim());
    } catch {
      throw new Error("Invalid callback URL format");
    }

    const code = callbackUrl.searchParams.get("code");
    const error = callbackUrl.searchParams.get("error");
    if (code) {
      return Promise.resolve(code);
    } else if (error) {
      throw new Error(`OAuth authorization failed: ${error}`);
    } else {
      throw new Error("No authorization code or error found in callback URL");
    }
  }
}
