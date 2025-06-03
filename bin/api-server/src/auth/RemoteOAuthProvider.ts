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
  // Redirect URI for OAuth callback (default: http://localhost:3001/oauth/{serverId}/callback)
  redirectUri?: string;
  // Local server port for capturing callback (default: 3001)
  callbackPort?: number;
}

/**
 * Remote OAuth provider for API server applications
 * Uses Authorization Code + PKCE flow implemented in base class
 */
export class RemoteOAuthProvider extends BaseMcpOAuthProvider {
  private defaultRedirectUri: string;
  private serverId: string;

  constructor(config: IRemoteOAuthConfig) {
    super(config);
    this.serverId = config.serverId;
    this.defaultRedirectUri = config.redirectUri ||
      `http://localhost:${
        config.callbackPort || 3000
      }/mcp/servers/${this.serverId}/oauth/callback`;
  }

  /**
   * The URL to redirect the user agent to after authorization
   */
  get redirectUrl(): string {
    return this.defaultRedirectUri;
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
