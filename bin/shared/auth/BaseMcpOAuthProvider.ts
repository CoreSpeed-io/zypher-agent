/**
 * Base OAuth Provider for MCP Servers
 *
 * Simple implementation of Authorization Code + PKCE flow for MCP OAuth 2.0:
 * 1. OAuth 2.0 Authorization Server Metadata discovery
 * 2. Generating authentication URLs with PKCE challenge
 * 3. Processing callback data and exchanging codes for tokens
 *
 * Subclasses only need to provide:
 * - redirectUrl getter
 * - clientMetadata getter
 */

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";

export interface McpOAuthConfig {
  serverUrl: string;
  oauthBaseDir: string;
  clientName: string;
}

interface AuthUrlInfo {
  url: string;
  codeVerifier: string;
  state: string;
}

interface OAuth2ServerMetadata {
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

/**
 * Base OAuth Provider for MCP Servers using manual OAuth 2.0 implementation
 */
export abstract class BaseMcpOAuthProvider implements OAuthClientProvider {
  protected config: McpOAuthConfig;
  protected serverMetadata: OAuth2ServerMetadata | null = null;
  protected scopes: string[] = [];

  constructor(config: McpOAuthConfig) {
    this.config = config;
  }

  abstract get redirectUrl(): string;
  abstract get clientMetadata(): OAuthClientMetadata;

  /**
   * Initialize server metadata using MCP-compliant OAuth 2.0 Authorization Server Metadata
   */
  protected async initializeServerMetadata(): Promise<OAuth2ServerMetadata> {
    if (this.serverMetadata) {
      return this.serverMetadata;
    }

    try {
      // Extract authorization base URL according to MCP spec section 2.3.2
      const serverUrl = new URL(this.config.serverUrl);
      const authorizationBaseUrl = new URL(serverUrl.origin);

      console.log("OAuth Configuration:");
      console.log(`  Server URL: ${this.config.serverUrl}`);
      console.log(`  Authorization Base URL: ${authorizationBaseUrl.href}`);

      // Try OAuth 2.0 Authorization Server Metadata discovery
      const metadataUrl = new URL(
        ".well-known/oauth-authorization-server",
        authorizationBaseUrl.href,
      );
      console.log(`Fetching OAuth metadata from: ${metadataUrl.href}`);

      const response = await fetch(metadataUrl.href);
      if (!response.ok) {
        throw new Error(
          `Discovery failed: ${response.status} ${response.statusText}`,
        );
      }

      const serverMetadata = await response.json() as OAuth2ServerMetadata;
      console.log(
        "✅ Successfully discovered OAuth 2.0 Authorization Server Metadata",
      );

      if (serverMetadata.authorization_endpoint) {
        console.log(
          `  Authorization Endpoint: ${serverMetadata.authorization_endpoint}`,
        );
      }
      if (serverMetadata.token_endpoint) {
        console.log(`  Token Endpoint: ${serverMetadata.token_endpoint}`);
      }

      this.serverMetadata = serverMetadata;
      return serverMetadata;
    } catch (error) {
      console.error(
        "Failed to discover OAuth 2.0 Authorization Server Metadata:",
        error,
      );
      throw new Error(
        `OAuth discovery failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private async generatePKCEChallenge(): Promise<
    { codeVerifier: string; codeChallenge: string }
  > {
    // Generate random code verifier (43-128 characters)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const codeVerifier = btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // Create SHA256 hash and base64url encode it
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    return { codeVerifier, codeChallenge };
  }

  /**
   * Generate random state for CSRF protection
   */
  private generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  /**
   * Generate authorization URL with PKCE challenge
   */
  async generateAuthUrl(): Promise<AuthUrlInfo> {
    const serverMetadata = await this.initializeServerMetadata();
    const clientId = await this.getOrCreateClientId();

    if (!serverMetadata.authorization_endpoint) {
      throw new Error("Authorization endpoint not found in server metadata");
    }

    // Generate PKCE code verifier and challenge
    const { codeVerifier, codeChallenge } = await this.generatePKCEChallenge();

    // Generate state for CSRF protection
    const state = this.generateState();

    // Build authorization URL
    const authorizationUrl = new URL(serverMetadata.authorization_endpoint);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", this.redirectUrl);
    authorizationUrl.searchParams.set("scope", this.scopes.join(" ") || "");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");

    console.log("Generated authorization URL:");
    console.log(`  URL: ${authorizationUrl.href}`);
    console.log(`  Code Challenge: ${codeChallenge}`);
    console.log(`  State: ${state}`);

    return {
      url: authorizationUrl.href,
      codeVerifier,
      state,
    };
  }

  /**
   * Process OAuth callback and exchange code for tokens
   */
  async processCallback(
    callbackData: Record<string, string>,
  ): Promise<OAuthTokens> {
    const serverMetadata = await this.initializeServerMetadata();
    const { code, state } = callbackData;

    if (!code) {
      throw new Error("Authorization code not found in callback");
    }

    // Retrieve stored PKCE verifier and state
    const codeVerifier = await this.getCodeVerifier();
    const expectedState = await this.getState();

    if (state !== expectedState) {
      throw new Error("State mismatch - possible CSRF attack");
    }

    if (!serverMetadata.token_endpoint) {
      throw new Error("Token endpoint not found in server metadata");
    }

    console.log("Exchanging authorization code for tokens...");

    try {
      // Exchange authorization code for tokens
      const clientId = await this.getOrCreateClientId();
      const tokenRequest = new URLSearchParams();
      tokenRequest.set("grant_type", "authorization_code");
      tokenRequest.set("code", code);
      tokenRequest.set("redirect_uri", this.redirectUrl);
      tokenRequest.set("client_id", clientId);
      tokenRequest.set("code_verifier", codeVerifier);

      const response = await fetch(serverMetadata.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: tokenRequest.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const result = await response.json() as OAuthTokens;

      console.log("✅ Successfully exchanged code for tokens");

      // Clean up stored PKCE verifier and state
      await this.clearCodeVerifier();
      await this.clearState();

      return result;
    } catch (error) {
      console.error("Token exchange failed:", error);
      throw new Error(
        `Token exchange failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Get or create OAuth client ID using Dynamic Client Registration if available
   */
  protected async getOrCreateClientId(): Promise<string> {
    const clientInfoPath = join(this.config.oauthBaseDir, "client.json");

    try {
      const clientInfo = JSON.parse(
        await Deno.readTextFile(clientInfoPath),
      ) as OAuthClientInformationFull;
      console.log(`Using existing client ID: ${clientInfo.client_id}`);
      return clientInfo.client_id;
    } catch {
      // Client doesn't exist, try to create it
      console.log(
        "No existing client found, attempting Dynamic Client Registration...",
      );

      try {
        const serverMetadata = await this.initializeServerMetadata();

        if (!serverMetadata.registration_endpoint) {
          throw new Error(
            "Server does not support Dynamic Client Registration",
          );
        }

        // Register new client
        const { redirect_uris: _, ...clientMetadataWithoutRedirectUris } =
          this.clientMetadata;
        const registrationRequest = {
          client_name: this.config.clientName,
          redirect_uris: [this.redirectUrl],
          grant_types: ["authorization_code"],
          response_types: ["code"],
          token_endpoint_auth_method: "none", // Public client
          ...clientMetadataWithoutRedirectUris,
        };

        const response = await fetch(serverMetadata.registration_endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(registrationRequest),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Registration failed: ${response.status} ${response.statusText} - ${errorText}`,
          );
        }

        const registrationResult = await response
          .json() as OAuthClientInformationFull;

        const clientInfo: OAuthClientInformationFull = {
          client_id: registrationResult.client_id,
          client_secret: registrationResult.client_secret,
          redirect_uris: [this.redirectUrl],
        };

        await ensureDir(this.config.oauthBaseDir);
        await Deno.writeTextFile(
          clientInfoPath,
          JSON.stringify(clientInfo, null, 2),
        );

        console.log(`✅ Registered new client: ${clientInfo.client_id}`);
        return clientInfo.client_id;
      } catch (registrationError) {
        console.warn("Dynamic Client Registration failed:", registrationError);
        throw new Error("Failed to obtain client credentials");
      }
    }
  }

  // Helper methods for storing PKCE verifier and state
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await ensureDir(this.config.oauthBaseDir);
    const codeVerifierPath = join(this.config.oauthBaseDir, "code_verifier");
    await Deno.writeTextFile(codeVerifierPath, codeVerifier);
    console.log(`💾 Saved code verifier to: ${codeVerifierPath}`);
  }

  protected async getCodeVerifier(): Promise<string> {
    const codeVerifierPath = join(this.config.oauthBaseDir, "code_verifier");
    try {
      const codeVerifier = await Deno.readTextFile(codeVerifierPath);
      console.log(`🔑 Retrieved code verifier from: ${codeVerifierPath}`);
      return codeVerifier;
    } catch (error) {
      console.error(
        `❌ Code verifier not found at: ${codeVerifierPath}`,
        error,
      );
      throw new Error(
        "Code verifier not found - OAuth flow may have been interrupted",
      );
    }
  }

  protected async clearCodeVerifier(): Promise<void> {
    const codeVerifierPath = join(this.config.oauthBaseDir, "code_verifier");
    try {
      await Deno.remove(codeVerifierPath);
      console.log(`🗑️ Cleared code verifier from: ${codeVerifierPath}`);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  protected async saveState(state: string): Promise<void> {
    await ensureDir(this.config.oauthBaseDir);
    const statePath = join(this.config.oauthBaseDir, "state");
    await Deno.writeTextFile(statePath, state);
    console.log(`💾 Saved state to: ${statePath}`);
  }

  protected async getState(): Promise<string> {
    const statePath = join(this.config.oauthBaseDir, "state");
    try {
      const state = await Deno.readTextFile(statePath);
      console.log(`🔑 Retrieved state from: ${statePath}`);
      return state;
    } catch (error) {
      console.error(`❌ State not found at: ${statePath}`, error);
      throw new Error("State not found - OAuth flow may have been interrupted");
    }
  }

  protected async clearState(): Promise<void> {
    const statePath = join(this.config.oauthBaseDir, "state");
    try {
      await Deno.remove(statePath);
      console.log(`🗑️ Cleared state from: ${statePath}`);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  // OAuthClientProvider interface implementation - required methods

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    try {
      const clientInfoPath = join(this.config.oauthBaseDir, "client.json");
      const clientInfo = JSON.parse(
        await Deno.readTextFile(clientInfoPath),
      ) as OAuthClientInformation;
      return clientInfo;
    } catch {
      return undefined;
    }
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    try {
      const tokensPath = join(this.config.oauthBaseDir, "tokens.json");
      const tokens = JSON.parse(
        await Deno.readTextFile(tokensPath),
      ) as OAuthTokens;
      return tokens;
    } catch {
      return undefined;
    }
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await ensureDir(this.config.oauthBaseDir);
    const tokensPath = join(this.config.oauthBaseDir, "tokens.json");
    await Deno.writeTextFile(tokensPath, JSON.stringify(tokens, null, 2));
  }

  async redirectToAuthorization(): Promise<void> {
    const authInfo = await this.generateAuthUrl();

    // Store PKCE verifier and state for later use in callback
    await this.saveCodeVerifier(authInfo.codeVerifier);
    await this.saveState(authInfo.state);

    console.log("\n🔐 OAuth Authorization Required");
    console.log("=====================================");
    console.log("Please open this URL in your browser:");
    console.log(authInfo.url);
    console.log("\nWaiting for authorization callback...");

    throw new Error(
      "Please use the new OAuth flow: generateAuthUrl() -> open browser -> processCallback()",
    );
  }

  async codeVerifier(): Promise<string> {
    return await this.getCodeVerifier();
  }

  // Additional MCP OAuth Provider interface methods
  async getClientInformation(): Promise<OAuthClientInformation> {
    const clientId = await this.getOrCreateClientId();
    return {
      client_id: clientId,
    };
  }

  async generateAuthRequest(
    options?: { scopes?: string[] },
  ): Promise<{ uri: string }> {
    if (options?.scopes) {
      this.scopes = options.scopes;
    }

    const authInfo = await this.generateAuthUrl();

    // Store PKCE verifier and state for later use in callback
    await this.saveCodeVerifier(authInfo.codeVerifier);
    await this.saveState(authInfo.state);

    return { uri: authInfo.url };
  }

  async handleAuthResponse(callbackUrl: string): Promise<OAuthTokens> {
    const url = new URL(callbackUrl);
    const params = new URLSearchParams(url.search);

    const callbackData: Record<string, string> = {};
    for (const [key, value] of params) {
      callbackData[key] = value;
    }

    return await this.processCallback(callbackData);
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const serverMetadata = await this.initializeServerMetadata();

    if (!serverMetadata.token_endpoint) {
      throw new Error("Token endpoint not found in server metadata");
    }

    console.log("Refreshing tokens...");

    try {
      const clientId = await this.getOrCreateClientId();
      const tokenRequest = new URLSearchParams();
      tokenRequest.set("grant_type", "refresh_token");
      tokenRequest.set("refresh_token", refreshToken);
      tokenRequest.set("client_id", clientId);

      const response = await fetch(serverMetadata.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: tokenRequest.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const result = await response.json() as OAuthTokens;

      console.log("✅ Successfully refreshed tokens");

      return {
        access_token: result.access_token,
        refresh_token: result.refresh_token || refreshToken,
        token_type: result.token_type || "Bearer",
        expires_in: result.expires_in,
        scope: result.scope,
      };
    } catch (error) {
      console.error("Token refresh failed:", error);
      throw new Error(
        `Token refresh failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Clear all OAuth authentication data
   */
  async clearAuthData(): Promise<void> {
    try {
      await this.clearCodeVerifier();
      await this.clearState();

      // Clear client information
      const clientInfoPath = join(this.config.oauthBaseDir, "client.json");
      try {
        await Deno.remove(clientInfoPath);
      } catch {
        // Ignore if file doesn't exist
      }

      // Clear tokens
      const tokensPath = join(this.config.oauthBaseDir, "tokens.json");
      try {
        await Deno.remove(tokensPath);
      } catch {
        // Ignore if file doesn't exist
      }

      console.log("✅ Cleared all OAuth authentication data");
    } catch (error) {
      console.error("Failed to clear OAuth data:", error);
      throw new Error(
        `Failed to clear OAuth data: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
