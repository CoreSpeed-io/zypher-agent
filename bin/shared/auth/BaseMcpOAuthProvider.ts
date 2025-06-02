/**
 * Base OAuth Provider for MCP Servers
 *
 * Complete implementation of Authorization Code + PKCE flow:
 * 1. Generating authentication URLs with PKCE challenge
 * 2. Processing callback data and exchanging codes for tokens
 *
 * Subclasses only need to provide:
 * - redirectUrl getter
 * - clientMetadata getter
 */

import * as client from "@panva/openid-client";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";

export interface IBaseMcpOAuthConfig {
  // Server URL for the MCP server
  serverUrl: string;
  // Base directory to store all OAuth credentials and files
  oauthBaseDir: string;
  // Client name to use for OAuth registration (default: zypher-agent)
  clientName?: string;
  // Client URI to use for OAuth registration
  clientUri?: string;
  // Software ID to use for OAuth registration
  softwareId?: string;
  // Software version to use for OAuth registration
  softwareVersion?: string;
  // Additional scopes to request (default: empty)
  scopes?: string[];
}

/**
 * OAuth callback data that applications pass back to the provider
 */
export interface OAuthCallbackData {
  // Authorization code from OAuth flow
  code?: string;
  // State parameter for CSRF protection
  state?: string;
  // Error from OAuth provider
  error?: string;
  // Error description
  error_description?: string;
}

/**
 * Authentication URL information for applications
 */
export interface AuthUrlInfo {
  // The URL user should visit for authentication
  url: string;
  // State parameter for CSRF protection (store this for validation)
  state?: string;
  // PKCE code verifier (store this for token exchange)
  codeVerifier?: string;
}

/**
 * Base class for MCP OAuth providers - Complete PKCE + Authorization Code implementation
 */
export abstract class BaseMcpOAuthProvider implements OAuthClientProvider {
  protected config: IBaseMcpOAuthConfig;
  protected serverUrlHash: string;
  protected clientName: string;
  protected clientUri: string;
  protected softwareId: string;
  protected softwareVersion: string;
  protected scopes: string[];

  // openid-client related properties
  protected configuration?: client.Configuration;

  constructor(config: IBaseMcpOAuthConfig) {
    this.config = config;
    this.serverUrlHash = "";
    this.clientName = config.clientName || "zypher-agent";
    this.clientUri = config.clientUri ||
      "https://github.com/spenciefy/zypher-agent";
    this.softwareId = config.softwareId || "zypher-agent";
    this.softwareVersion = config.softwareVersion || "1.0.0";
    this.scopes = config.scopes || [];
  }

  /**
   * Generate authorization URL with PKCE challenge
   */
  async generateAuthUrl(): Promise<AuthUrlInfo> {
    const config = await this.initializeConfiguration();

    // Generate PKCE code verifier and challenge
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

    // Generate state for CSRF protection
    const state = client.randomState();

    // Save PKCE verifier and state for later use
    await this.saveCodeVerifier(codeVerifier);
    await this.saveState(state);

    // Build authorization URL
    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUrl,
      scope: this.scopes.join(" ") || "openid",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state: state,
    });

    return {
      url: authUrl.href,
      state: state,
      codeVerifier: codeVerifier,
    };
  }

  /**
   * Process authorization callback and exchange code for tokens
   */
  async processCallback(callbackData: OAuthCallbackData): Promise<void> {
    if (callbackData.error) {
      throw new Error(
        `OAuth error: ${callbackData.error} - ${
          callbackData.error_description || "Unknown error"
        }`,
      );
    }

    if (!callbackData.code) {
      throw new Error("No authorization code provided in callback");
    }

    // Verify state for CSRF protection
    const savedState = await this.getSavedState();
    if (callbackData.state !== savedState) {
      throw new Error("Invalid state parameter - possible CSRF attack");
    }

    // Exchange authorization code for tokens
    await this.exchangeCodeForTokens(callbackData.code);
  }

  /**
   * Start the OAuth authorization flow
   * For backward compatibility - new pattern is generateAuthUrl() + processCallback()
   */
  async redirectToAuthorization(): Promise<void> {
    const authInfo = await this.generateAuthUrl();

    console.log("\n🔐 OAuth Authorization Required");
    console.log("=====================================");
    console.log("Please open this URL in your browser:");
    console.log(authInfo.url);
    console.log("\nWaiting for authorization callback...");

    throw new Error(
      "Please use the new OAuth flow: generateAuthUrl() -> open browser -> processCallback()",
    );
  }

  /**
   * Exchange authorization code for tokens using PKCE
   */
  private async exchangeCodeForTokens(
    authorizationCode: string,
  ): Promise<void> {
    const config = await this.initializeConfiguration();
    const codeVerifier = await this.codeVerifier();

    try {
      // Create a URL object with the authorization code as if it came from a redirect
      const callbackUrl = new URL(this.redirectUrl);
      callbackUrl.searchParams.set("code", authorizationCode);

      const tokenResponse = await client.authorizationCodeGrant(
        config,
        callbackUrl,
        {
          pkceCodeVerifier: codeVerifier,
        },
      );

      const tokens: OAuthTokens = {
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type || "Bearer",
        expires_in: tokenResponse.expires_in,
        refresh_token: tokenResponse.refresh_token,
        scope: tokenResponse.scope,
      };

      await this.saveTokens(tokens);
      console.log("✅ OAuth authentication successful!");

      // Clean up temporary data
      await this.deleteConfigFile("code_verifier.json");
      await this.deleteConfigFile("state.json");
    } catch (error) {
      console.error("Token exchange failed:", error);
      throw new Error(
        `Failed to exchange authorization code for tokens: ${error}`,
      );
    }
  }

  /**
   * Save state parameter for CSRF protection
   */
  private async saveState(state: string): Promise<void> {
    await this.writeJsonFile("state.json", { state });
  }

  /**
   * Get saved state parameter
   */
  private async getSavedState(): Promise<string> {
    const stateData = await this.readJsonFile<{ state: string }>("state.json");
    if (!stateData?.state) {
      throw new Error("State parameter not found");
    }
    return stateData.state;
  }

  /**
   * Generate a stable hash for the server URL
   */
  protected async getServerHash(): Promise<string> {
    if (this.serverUrlHash) {
      return this.serverUrlHash;
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(this.config.serverUrl);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    this.serverUrlHash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 16);
    return this.serverUrlHash;
  }

  /**
   * Ensure the storage directory exists
   */
  protected async ensureStorageDir(): Promise<void> {
    await ensureDir(this.config.oauthBaseDir);
    const serverHash = await this.getServerHash();
    const serverDir = join(this.config.oauthBaseDir, serverHash);
    await ensureDir(serverDir);
  }

  /**
   * Get the full path for a configuration file
   */
  protected async getConfigFilePath(filename: string): Promise<string> {
    await this.ensureStorageDir();
    const serverHash = await this.getServerHash();
    return join(this.config.oauthBaseDir, serverHash, filename);
  }

  /**
   * Read a JSON file from storage
   */
  protected async readJsonFile<T>(filename: string): Promise<T | undefined> {
    try {
      const filePath = await this.getConfigFilePath(filename);
      const content = await Deno.readTextFile(filePath);
      return JSON.parse(content) as T;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.error(`Error reading ${filename}:`, error);
      }
      return undefined;
    }
  }

  /**
   * Write a JSON file to storage
   */
  protected async writeJsonFile(
    filename: string,
    data: unknown,
  ): Promise<void> {
    const filePath = await this.getConfigFilePath(filename);
    await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Delete a configuration file
   */
  protected async deleteConfigFile(filename: string): Promise<void> {
    try {
      const filePath = await this.getConfigFilePath(filename);
      await Deno.remove(filePath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.error(`Error deleting ${filename}:`, error);
      }
    }
  }

  /**
   * Initialize the OAuth configuration using openid-client discovery
   */
  protected async initializeConfiguration(): Promise<client.Configuration> {
    if (this.configuration) {
      return this.configuration;
    }

    try {
      const discoveryUrl = new URL(new URL(this.config.serverUrl).origin);
      const clientId = await this.getOrCreateClientId();

      console.log("OAuth Configuration:");
      console.log(`  Server URL: ${this.config.serverUrl}`);
      console.log(`  Discovery URL: ${discoveryUrl.href}`);
      console.log(`  Client ID: ${clientId}`);

      // Fetch OAuth server metadata
      const metadataUrl = new URL(
        `${discoveryUrl.href}/.well-known/oauth-authorization-server`,
      );
      console.log(`Fetching OAuth metadata from: ${metadataUrl.href}`);

      const response = await fetch(metadataUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch OAuth metadata: ${response.status} ${response.statusText}`,
        );
      }

      const serverMetadata = await response.json();
      console.log(`Found issuer in metadata: ${serverMetadata.issuer}`);

      const issuerUrl = new URL(serverMetadata.issuer);

      // Try openid-client discovery first
      try {
        this.configuration = await client.discovery(
          issuerUrl,
          clientId,
          undefined,
        );
        console.log(
          "Successfully configured OAuth 2.0 using openid-client discovery",
        );
      } catch (discoveryError) {
        console.warn(
          "OAuth discovery failed, using fallback configuration:",
          discoveryError,
        );

        // Fallback: use the metadata we already fetched
        this.configuration = (({
          serverMetadata: () => serverMetadata,
          clientId,
          clientSecret: undefined,
        }) as unknown) as client.Configuration;

        console.log("Using fallback OAuth configuration");
      }

      return this.configuration;
    } catch (error) {
      console.error("Failed to initialize OAuth configuration:", error);
      throw new Error(`OAuth configuration failed: ${error}`);
    }
  }

  /**
   * Get existing client ID or create a new one
   */
  protected async getOrCreateClientId(): Promise<string> {
    const existingClientInfo = await this.clientInformation();
    if (existingClientInfo?.client_id) {
      return existingClientInfo.client_id;
    }

    // Default client ID - subclasses can override
    return "zypher-agent-client";
  }

  /**
   * Check if a token is expired
   */
  protected isTokenExpired(tokens: OAuthTokens): boolean {
    if (!tokens.expires_in) {
      return false; // No expiration info, assume valid
    }
    // This is a simplified check - in a real implementation,
    // we'd store the token issue time and calculate expiration
    return false;
  }

  /**
   * Attempt to refresh tokens using the refresh token
   */
  protected async refreshTokensIfPossible(
    tokens: OAuthTokens,
  ): Promise<OAuthTokens | null> {
    if (!tokens.refresh_token || !this.configuration) {
      return null;
    }

    try {
      const refreshedTokens = await client.refreshTokenGrant(
        this.configuration,
        tokens.refresh_token,
      );

      return {
        access_token: refreshedTokens.access_token,
        token_type: refreshedTokens.token_type || "Bearer",
        expires_in: refreshedTokens.expires_in,
        refresh_token: refreshedTokens.refresh_token || tokens.refresh_token,
        scope: refreshedTokens.scope,
      };
    } catch (error) {
      console.error("Token refresh failed:", error);
      return null;
    }
  }

  // OAuthClientProvider interface implementation

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    return await this.readJsonFile<OAuthClientInformation>("client_info.json");
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationFull,
  ): Promise<void> {
    await this.writeJsonFile("client_info.json", clientInformation);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const tokens = await this.readJsonFile<OAuthTokens>("tokens.json");

    // Check if tokens are expired and attempt refresh if possible
    if (tokens && this.isTokenExpired(tokens)) {
      const refreshedTokens = await this.refreshTokensIfPossible(tokens);
      if (refreshedTokens) {
        await this.saveTokens(refreshedTokens);
        return refreshedTokens;
      }
    }

    return tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.writeJsonFile("tokens.json", tokens);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.writeJsonFile("code_verifier.json", { codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const pkceData = await this.readJsonFile<{ codeVerifier: string }>(
      "code_verifier.json",
    );
    if (!pkceData?.codeVerifier) {
      throw new Error("PKCE code verifier not found");
    }
    return pkceData.codeVerifier;
  }

  /**
   * Clears all stored authentication data
   */
  async clearAuthData(): Promise<void> {
    await this.deleteConfigFile("client_info.json");
    await this.deleteConfigFile("tokens.json");
    await this.deleteConfigFile("code_verifier.json");
    await this.deleteConfigFile("state.json");
    console.log("Cleared OAuth authentication data");
  }

  // Abstract methods that subclasses must implement

  /**
   * The URL to redirect the user agent to after authorization
   */
  abstract get redirectUrl(): string;

  /**
   * Metadata about this OAuth client for dynamic registration
   */
  abstract get clientMetadata(): OAuthClientMetadata;
}
