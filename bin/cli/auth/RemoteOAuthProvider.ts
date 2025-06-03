/**
 * Remote OAuth Provider for CLI
 *
 * Simple configuration-only implementation for CLI environments.
 * All PKCE + Authorization Code logic is handled by BaseMcpOAuthProvider.
 */

import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  BaseMcpOAuthProvider,
  type McpOAuthConfig,
} from "../../shared/auth/BaseMcpOAuthProvider.ts";

export interface IRemoteOAuthConfig extends McpOAuthConfig {
  // Redirect URI for OAuth callback (default: http://localhost:8080/callback)
  redirectUri?: string;
  // Local server port for capturing callback (default: 8080)
  callbackPort?: number;
}

/**
 * Remote OAuth provider for CLI applications
 * Uses Authorization Code + PKCE flow implemented in base class
 */
export class RemoteOAuthProvider extends BaseMcpOAuthProvider {
  private defaultRedirectUri: string;

  constructor(config: IRemoteOAuthConfig) {
    super(config);
    this.defaultRedirectUri = config.redirectUri ||
      `http://localhost:${config.callbackPort || 8080}/callback`;
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
      client_uri: "https://github.com/zypher-ai/zypher-agent",
      software_id: "zypher-agent",
      software_version: "0.1.0",
    };
  }

  /**
   * Override to provide remote-specific client ID
   */
  protected override async getOrCreateClientId(): Promise<string> {
    const existingClientInfo = await this.clientInformation();
    if (existingClientInfo?.client_id) {
      return existingClientInfo.client_id;
    }
    return "zypher-agent-pkce-client";
  }
}
