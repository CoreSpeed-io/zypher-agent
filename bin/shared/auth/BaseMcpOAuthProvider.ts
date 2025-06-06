/**
 * Base OAuth Provider for MCP Servers
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
import { OAuth2Client } from "jsr:@cmd-johnson/oauth2-client@^2.0.0";
import type { Tokens } from "jsr:@cmd-johnson/oauth2-client@^2.0.0";

export interface McpOAuthConfig {
  serverUrl: string;
  oauthBaseDir: string;
  clientName: string;
  // Timeout for OAuth requests in milliseconds (default: 30000ms = 30 seconds)
  timeoutMs?: number;
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

// Default OAuth timeout: 30 seconds
const DEFAULT_OAUTH_TIMEOUT_MS = 30000;

/**
 * Base OAuth Provider for MCP Servers using @cmd-johnson/oauth2-client
 * Supports Authorization Code + PKCE flow only
 */
export abstract class BaseMcpOAuthProvider implements OAuthClientProvider {
  protected config: McpOAuthConfig;
  protected serverMetadata: OAuth2ServerMetadata | null = null;
  protected scopes: string[] = [];
  protected oauth2Client: OAuth2Client | null = null;
  #timeoutMs: number;

  constructor(config: McpOAuthConfig) {
    this.config = config;
    this.#timeoutMs = config.timeoutMs ?? DEFAULT_OAUTH_TIMEOUT_MS;
    console.log(`OAuth timeout configured: ${this.#timeoutMs}ms`);
  }

  abstract get redirectUrl(): string;
  abstract get clientMetadata(): OAuthClientMetadata;

  /**
   * Set OAuth scopes for the authorization request
   */
  setScopes(scopes: string[]): void {
    this.scopes = scopes;
    console.log(`Set OAuth scopes: ${scopes.join(", ")}`);
  }

  /**
   * Set timeout for OAuth requests
   */
  setTimeout(timeoutMs: number): void {
    if (timeoutMs <= 0) {
      throw new Error("Timeout must be greater than 0");
    }
    this.#timeoutMs = timeoutMs;
    console.log(`Updated OAuth timeout: ${timeoutMs}ms`);
  }

  /**
   * Get current timeout setting
   */
  getTimeout(): number {
    return this.#timeoutMs;
  }

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

      const response = await this.fetchWithTimeout(metadataUrl.href);
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
   * Initialize OAuth2Client with discovered endpoints
   */
  protected async initializeOAuth2Client(): Promise<OAuth2Client> {
    if (this.oauth2Client) {
      return this.oauth2Client;
    }

    const serverMetadata = await this.initializeServerMetadata();
    const clientId = await this.getOrCreateClientId();

    if (
      !serverMetadata.authorization_endpoint || !serverMetadata.token_endpoint
    ) {
      throw new Error(
        "Authorization or token endpoint not found in server metadata",
      );
    }

    this.oauth2Client = new OAuth2Client({
      clientId,
      clientSecret: await this.getClientSecret(),
      authorizationEndpointUri: serverMetadata.authorization_endpoint,
      tokenUri: serverMetadata.token_endpoint,
      redirectUri: this.redirectUrl,
      defaults: {
        scope: this.scopes.join(" ") || "",
      },
    });

    return this.oauth2Client;
  }

  /**
   * Get client secret from stored client information
   */
  protected async getClientSecret(): Promise<string | undefined> {
    try {
      const clientInfoPath = join(this.config.oauthBaseDir, "client.json");
      const clientInfo = JSON.parse(
        await Deno.readTextFile(clientInfoPath),
      ) as OAuthClientInformationFull;
      return clientInfo.client_secret;
    } catch {
      return undefined; // For public clients
    }
  }

  /**
   * Generate authorization URL with PKCE challenge
   */
  async generateAuthUrl(): Promise<AuthUrlInfo> {
    const client = await this.initializeOAuth2Client();

    // Generate authorization URL with PKCE (default behavior)
    const authResult = await client.code.getAuthorizationUri({
      scope: this.scopes.join(" ") || "",
    });

    console.log("Generated authorization URL:");
    console.log(`  URL: ${authResult.uri.href}`);

    // PKCE is enabled by default, so codeVerifier should always be present
    if (!("codeVerifier" in authResult)) {
      throw new Error("PKCE is required but codeVerifier was not generated");
    }

    const codeVerifier = authResult.codeVerifier;
    console.log(`  Code Verifier: ${codeVerifier}`);

    // Extract state from the authorization URL
    let state = authResult.uri.searchParams.get("state") || "";

    // If no state was generated, create one - some servers require it
    if (!state) {
      state = crypto.randomUUID();
      const urlWithState = new URL(authResult.uri.href);
      urlWithState.searchParams.set("state", state);

      console.log(`  Generated state parameter: ${state}`);
      console.log(`  Enhanced URL with state: ${urlWithState.href}`);

      return {
        url: urlWithState.href,
        codeVerifier,
        state,
      };
    }

    return {
      url: authResult.uri.href,
      codeVerifier,
      state,
    };
  }

  /**
   * Process OAuth callback and exchange code for tokens using PKCE
   */
  async processCallback(
    callbackData: Record<string, string>,
  ): Promise<OAuthTokens> {
    const client = await this.initializeOAuth2Client();
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

    console.log("Exchanging authorization code for tokens using PKCE...");

    try {
      // Construct callback URL for the oauth2-client library
      const callbackUrl = new URL(this.redirectUrl);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);

      // Exchange authorization code for tokens with PKCE verifier
      const tokens = await client.code.getToken(callbackUrl, {
        codeVerifier,
      });

      console.log("✅ Successfully exchanged code for tokens");

      // Clean up stored PKCE verifier and state
      await this.clearCodeVerifier();
      await this.clearState();

      // Convert from oauth2-client format to MCP format
      return this.convertTokensToMcpFormat(tokens);
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
   * Convert oauth2-client tokens to MCP OAuth tokens format
   */
  protected convertTokensToMcpFormat(tokens: Tokens): OAuthTokens {
    return {
      access_token: tokens.accessToken,
      token_type: tokens.tokenType || "Bearer",
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresIn,
      scope: Array.isArray(tokens.scope)
        ? tokens.scope.join(" ")
        : tokens.scope,
    };
  }

  /**
   * Convert MCP OAuth tokens to oauth2-client tokens format
   */
  protected convertTokensFromMcpFormat(mcpTokens: OAuthTokens): Tokens {
    return {
      accessToken: mcpTokens.access_token,
      tokenType: mcpTokens.token_type || "Bearer",
      refreshToken: mcpTokens.refresh_token,
      expiresIn: mcpTokens.expires_in,
      scope: typeof mcpTokens.scope === "string"
        ? mcpTokens.scope.split(" ")
        : mcpTokens.scope,
    };
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

        const response = await this.fetchWithTimeout(
          serverMetadata.registration_endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(registrationRequest),
          },
        );

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
        "Code verifier not found - PKCE is required for this OAuth flow",
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

  /**
   * Fetch with timeout support
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs?: number,
  ): Promise<Response> {
    const timeout = timeoutMs ?? this.#timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        const urlObj = new URL(url);
        const operation = urlObj.pathname.includes("oauth-authorization-server")
          ? "OAuth metadata discovery"
          : urlObj.pathname.includes("oauth")
          ? "OAuth token exchange"
          : "OAuth request";
        throw new Error(`${operation} timed out after ${timeout}ms: ${url}`);
      }
      throw error;
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

  async saveClientInformation(
    clientInfo: OAuthClientInformation,
  ): Promise<void> {
    await ensureDir(this.config.oauthBaseDir);
    const clientInfoPath = join(this.config.oauthBaseDir, "client.json");
    await Deno.writeTextFile(
      clientInfoPath,
      JSON.stringify(clientInfo, null, 2),
    );
    console.log(`💾 Saved client information to: ${clientInfoPath}`);
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

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    console.log("Refreshing tokens...");

    try {
      // Use direct HTTP calls for token refresh since oauth2-client doesn't expose this
      const serverMetadata = await this.initializeServerMetadata();

      if (!serverMetadata.token_endpoint) {
        throw new Error("Token endpoint not found in server metadata");
      }

      const clientId = await this.getOrCreateClientId();
      const clientSecret = await this.getClientSecret();

      const tokenRequest = new URLSearchParams();
      tokenRequest.set("grant_type", "refresh_token");
      tokenRequest.set("refresh_token", refreshToken);
      tokenRequest.set("client_id", clientId);
      if (clientSecret) {
        tokenRequest.set("client_secret", clientSecret);
      }

      const response = await this.fetchWithTimeout(
        serverMetadata.token_endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
          },
          body: tokenRequest.toString(),
        },
      );

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
