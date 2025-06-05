/**
 * Remote OAuth Provider for API Server
 *
 * Simple configuration-only implementation for API server environments.
 * All PKCE + Authorization Code logic is handled by BaseMcpOAuthProvider.
 */

import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  BaseMcpOAuthProvider,
  type McpOAuthConfig,
} from "../../../shared/auth/BaseMcpOAuthProvider.ts";

export interface IRemoteOAuthConfig extends McpOAuthConfig {
  // Server ID for this OAuth flow
  serverId: string;
  // Redirect URI for OAuth callback (if not provided, will be constructed from host/port)
  redirectUri?: string;
  // Host/domain for the callback URL (default: localhost, use your domain for Docker)
  host?: string;
  // Port for capturing callback (default: 3000)
  callbackPort?: number;
  // Use HTTPS for redirect URI (default: false, set true for production)
  useHttps?: boolean;
}

/**
 * Remote OAuth provider for API server applications
 * Uses Authorization Code + PKCE flow implemented in base class
 */
export class RemoteOAuthProvider extends BaseMcpOAuthProvider {
  #defaultRedirectUri: string;
  #serverId: string;

  constructor(config: IRemoteOAuthConfig) {
    super(config);
    this.#serverId = config.serverId;

    // Build redirect URI with Docker-friendly defaults
    if (config.redirectUri) {
      this.#defaultRedirectUri = config.redirectUri;
    } else {
      // Check environment variables commonly used in Docker deployments
      const host = config.host ||
        Deno.env.get("OAUTH_HOST") ||
        Deno.env.get("PUBLIC_URL")?.replace(/^https?:\/\//, "") ||
        "localhost";

      const port = config.callbackPort ||
        Number.parseInt(Deno.env.get("OAUTH_PORT") || "3000");

      const useHttps = config.useHttps ||
        Deno.env.get("OAUTH_USE_HTTPS") === "true" ||
        Deno.env.get("NODE_ENV") === "production";

      const protocol = useHttps ? "https" : "http";
      const portSuffix =
        (useHttps && port === 443) || (!useHttps && port === 80)
          ? ""
          : `:${port}`;

      this.#defaultRedirectUri =
        `${protocol}://${host}${portSuffix}/mcp/servers/${this.#serverId}/oauth/callback`;
    }

    console.log(`OAuth redirect URI: ${this.#defaultRedirectUri}`);
  }

  /**
   * The URL to redirect the user agent to after authorization
   */
  get redirectUrl(): string {
    return this.#defaultRedirectUri;
  }

  /**
   * Metadata about this OAuth client for dynamic registration
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: "none", // Public client (PKCE)
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: this.config.clientName,
    };
  }
}
