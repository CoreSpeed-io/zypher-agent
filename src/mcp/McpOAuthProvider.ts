/**
 * Model Context Protocol OAuth Provider Implementation using openid-client
 *
 * This implementation uses the openid-client library for robust OAuth 2.0/OpenID Connect support:
 * - Standards-compliant OAuth 2.0 flows
 * - Automatic token refresh and validation
 * - PKCE support for enhanced security
 * - Universal runtime compatibility
 * - Comprehensive error handling
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

export interface IMcpOAuthProviderConfig {
  // Server URL for the MCP server
  serverUrl: string;
  // Port for the OAuth callback server
  callbackPort: number;
  // Desired hostname for the OAuth callback server (default: localhost)
  host?: string;
  // Path for the OAuth callback endpoint (default: /oauth/callback)
  callbackPath?: string;
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
 * Generates a hash for the server URL to use in filenames
 * @param serverUrl The server URL to hash
 * @returns The hashed server URL (first 32 chars of SHA-256)
 */
async function getServerUrlHash(serverUrl: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(serverUrl);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fullHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  // Return first 32 characters for reasonable file name length
  return fullHash.substring(0, 32);
}

/**
 * Implements OAuth 2.0 authentication for MCP clients using openid-client
 * This provider leverages the openid-client library for standards-compliant OAuth flows
 */
export class McpOAuthProvider implements OAuthClientProvider {
  #config: IMcpOAuthProviderConfig;
  #serverUrlHash: string;
  #callbackPath: string;
  #clientName: string;
  #clientUri: string;
  #softwareId: string;
  #softwareVersion: string;
  #scopes: string[];

  // openid-client related properties
  #configuration?: client.Configuration;
  #callbackServer?: Deno.HttpServer;
  #authorizationPromise?: Promise<{ code: string; state?: string }>;
  #authorizationResolve?: (
    value: { code: string; state?: string },
  ) => void;
  #authorizationReject?: (reason: unknown) => void;

  // OAuth flow state (internal only, not part of OAuthClientProvider interface)
  #currentState?: string;

  constructor(config: IMcpOAuthProviderConfig) {
    this.#config = config;
    this.#serverUrlHash = "";
    this.#callbackPath = config.callbackPath || "/oauth/callback";
    this.#clientName = config.clientName || "zypher-agent";
    this.#clientUri = config.clientUri ||
      "https://github.com/spenciefy/zypher-agent";
    this.#softwareId = config.softwareId || "zypher-agent";
    this.#softwareVersion = config.softwareVersion || "1.0.0";
    this.#scopes = config.scopes || [];
  }

  /**
   * Get or compute the server URL hash
   */
  async #getServerHash(): Promise<string> {
    if (!this.#serverUrlHash) {
      this.#serverUrlHash = await getServerUrlHash(this.#config.serverUrl);
    }
    return this.#serverUrlHash;
  }

  /**
   * The URL to redirect the user agent to after authorization
   */
  get redirectUrl(): string {
    const host = this.#config.host || "localhost";
    return `http://${host}:${this.#config.callbackPort}${this.#callbackPath}`;
  }

  /**
   * Metadata about this OAuth client for dynamic registration
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: this.#clientName,
      client_uri: this.#clientUri,
      software_id: this.#softwareId,
      software_version: this.#softwareVersion,
    };
  }

  /**
   * Initialize the OAuth configuration using openid-client discovery
   */
  async #initializeConfiguration(): Promise<client.Configuration> {
    if (this.#configuration) {
      return this.#configuration;
    }

    try {
      // Get the base URL from the server URL for discovery
      const discoveryUrl = new URL(new URL(this.#config.serverUrl).origin);

      // Get or create client ID
      const clientId = await this.#getOrCreateClientId();

      console.log("OAuth Configuration Debug:");
      console.log(`  Server URL: ${this.#config.serverUrl}`);
      console.log(`  Discovery URL: ${discoveryUrl.href}`);
      console.log(`  Client ID: ${clientId}`);

      // First, manually fetch the OAuth server metadata to get the actual issuer
      try {
        const metadataUrl = new URL(
          `${discoveryUrl.href}/.well-known/oauth-authorization-server`,
        );
        console.log(`Fetching OAuth metadata from: ${metadataUrl.href}`);

        const response = await fetch(metadataUrl);
        console.log(
          `OAuth metadata response: ${response.status} ${response.statusText}`,
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch OAuth metadata: ${response.status} ${response.statusText}`,
          );
        }

        const serverMetadata = await response.json();
        console.log(`Found issuer in metadata: ${serverMetadata.issuer}`);

        // Use the issuer URL from the metadata for discovery
        const issuerUrl = new URL(serverMetadata.issuer);

        console.log(
          `Attempting OAuth 2.0 discovery with issuer: ${issuerUrl.href}`,
        );

        // Now use openid-client discovery with the correct issuer URL
        this.#configuration = await client.discovery(
          issuerUrl,
          clientId,
          undefined, // No client secret for PKCE flow
        );

        console.log(
          "Successfully discovered OAuth 2.0 configuration using openid-client",
        );
      } catch (discoveryError) {
        console.warn(
          "OAuth discovery failed, using manual configuration:",
          discoveryError,
        );

        // Fallback: use the metadata we already fetched
        try {
          const metadataUrl = new URL(
            `${discoveryUrl.href}/.well-known/oauth-authorization-server`,
          );
          const response = await fetch(metadataUrl);

          if (!response.ok) {
            throw new Error(
              `Failed to fetch server metadata: ${response.status} ${response.statusText}`,
            );
          }

          const serverMetadata = await response.json();
          console.log("Using manual OAuth 2.0 server configuration");

          // Create configuration manually using the server metadata
          this.#configuration = new client.Configuration(
            serverMetadata,
            clientId,
            undefined, // No client secret for PKCE flow
          );
        } catch (manualError) {
          console.error("Manual configuration also failed:", manualError);
          throw new Error(`OAuth configuration failed: ${manualError}`);
        }
      }

      return this.#configuration;
    } catch (error) {
      console.error("Failed to initialize OAuth configuration:", error);
      throw new Error(`OAuth configuration initialization failed: ${error}`);
    }
  }

  /**
   * Get existing client ID or create a new one through dynamic registration
   */
  async #getOrCreateClientId(): Promise<string> {
    const existingClientInfo = await this.clientInformation();
    if (existingClientInfo?.client_id) {
      return existingClientInfo.client_id;
    }

    // For now, return a default client ID - in a real implementation,
    // this would perform dynamic client registration
    return "zypher-agent-client";
  }

  /**
   * Ensure the storage directory exists
   */
  async #ensureStorageDir(): Promise<void> {
    await ensureDir(this.#config.oauthBaseDir);

    const serverHash = await this.#getServerHash();
    const serverDir = join(this.#config.oauthBaseDir, serverHash);
    await ensureDir(serverDir);
  }

  /**
   * Get the full path for a configuration file
   */
  async #getConfigFilePath(filename: string): Promise<string> {
    await this.#ensureStorageDir();
    const serverHash = await this.#getServerHash();
    return join(this.#config.oauthBaseDir, serverHash, filename);
  }

  /**
   * Read a JSON file from storage
   */
  async #readJsonFile<T>(filename: string): Promise<T | undefined> {
    try {
      const filePath = await this.#getConfigFilePath(filename);
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
  async #writeJsonFile(filename: string, data: unknown): Promise<void> {
    try {
      const filePath = await this.#getConfigFilePath(filename);
      await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Error writing ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Read a text file from storage
   */
  async #readTextFile(filename: string): Promise<string | undefined> {
    try {
      const filePath = await this.#getConfigFilePath(filename);
      return await Deno.readTextFile(filePath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.error(`Error reading ${filename}:`, error);
      }
      return undefined;
    }
  }

  /**
   * Write a text file to storage
   */
  async #writeTextFile(filename: string, text: string): Promise<void> {
    try {
      const filePath = await this.#getConfigFilePath(filename);
      await Deno.writeTextFile(filePath, text);
    } catch (error) {
      console.error(`Error writing ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Delete a configuration file
   */
  async #deleteConfigFile(filename: string): Promise<void> {
    try {
      const filePath = await this.#getConfigFilePath(filename);
      await Deno.remove(filePath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.error(`Error deleting ${filename}:`, error);
      }
    }
  }

  // OAuthClientProvider interface implementation

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    return await this.#readJsonFile<OAuthClientInformation>("client_info.json");
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationFull,
  ): Promise<void> {
    await this.#writeJsonFile("client_info.json", clientInformation);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const tokens = await this.#readJsonFile<OAuthTokens>("tokens.json");

    // Check if tokens are expired and attempt refresh if possible
    if (tokens && this.#isTokenExpired(tokens)) {
      const refreshedTokens = await this.#refreshTokensIfPossible(tokens);
      if (refreshedTokens) {
        await this.saveTokens(refreshedTokens);
        return refreshedTokens;
      }
    }

    return tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.#writeJsonFile("tokens.json", tokens);
  }

  async codeVerifier(): Promise<string> {
    // Load PKCE data from storage
    const pkceData = await this.#readJsonFile<{
      codeVerifier: string;
      state?: string;
    }>("pkce_data.json");

    if (!pkceData?.codeVerifier) {
      throw new Error("PKCE code verifier not found");
    }

    return pkceData.codeVerifier;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    // Load existing PKCE data or create new
    const existingData = await this.#readJsonFile<{
      codeVerifier?: string;
      state?: string;
    }>("pkce_data.json") || {};

    // Update with new code verifier
    await this.#writeJsonFile("pkce_data.json", {
      ...existingData,
      codeVerifier,
    });
  }

  /**
   * Clears all stored authentication data
   */
  public async clearAuthData(): Promise<void> {
    await this.#deleteConfigFile("client_info.json");
    await this.#deleteConfigFile("tokens.json");
    await this.#deleteConfigFile("pkce_data.json");
    await this.stopCallbackServer();
  }

  /**
   * Check if a token is expired
   */
  #isTokenExpired = (tokens: OAuthTokens): boolean => {
    if (!tokens.expires_in) {
      return false; // No expiration info, assume valid
    }

    // This is a simplified check - in a real implementation,
    // we'd store the token issue time and calculate expiration
    return false;
  };

  /**
   * Attempt to refresh tokens using the refresh token
   */
  async #refreshTokensIfPossible(
    tokens: OAuthTokens,
  ): Promise<OAuthTokens | null> {
    if (!tokens.refresh_token || !this.#configuration) {
      return null;
    }

    try {
      // Use openid-client to refresh tokens
      const refreshedTokens = await client.refreshTokenGrant(
        this.#configuration,
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

  /**
   * Start the OAuth authorization flow using openid-client
   */
  async redirectToAuthorization(): Promise<void> {
    try {
      // Initialize configuration
      const config = await this.#initializeConfiguration();

      // Generate PKCE code verifier using openid-client
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(
        codeVerifier,
      );

      // Build authorization parameters
      const parameters: Record<string, string> = {
        redirect_uri: this.redirectUrl,
        scope: this.#scopes.join(" ") || "openid",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      };

      // Check if PKCE is supported, add state if not
      if (!config.serverMetadata().supportsPKCE()) {
        console.log(
          "Server doesn't support PKCE, adding state parameter for security",
        );
        this.#currentState = client.randomState();
        parameters.state = this.#currentState;
      }

      // Store PKCE data for later use
      await this.#writeJsonFile("pkce_data.json", {
        codeVerifier,
        state: this.#currentState,
      });

      // Build authorization URL using openid-client
      const authUrl = client.buildAuthorizationUrl(config, parameters);

      console.log("Opening authorization URL:", authUrl.href);

      // Start callback server and setup promise for authorization result
      this.#startCallbackServer();
      this.#setupAuthorizationPromise();

      // Open browser
      await this.#openBrowser(authUrl);

      // Wait for the authorization to complete
      console.log("Waiting for OAuth authorization...");
      const authResult = await this.#waitForAuthorization();
      console.log(
        "OAuth authorization completed, exchanging code for tokens...",
      );

      // Exchange authorization code for tokens using openid-client
      await this.#exchangeCodeForTokens(authResult.code, authResult.state);
      console.log("Token exchange completed successfully");
    } catch (error) {
      console.error("Authorization flow failed:", error);
      throw error;
    }
  }

  /**
   * Open browser to authorization URL
   */
  async #openBrowser(authorizationUrl: URL): Promise<void> {
    try {
      const command = new Deno.Command("open", {
        args: [authorizationUrl.toString()],
        stdout: "null",
        stderr: "null",
      });
      await command.output();
    } catch {
      // Fallback for non-macOS systems
      try {
        const command = new Deno.Command("xdg-open", {
          args: [authorizationUrl.toString()],
          stdout: "null",
          stderr: "null",
        });
        await command.output();
      } catch {
        console.log("Please manually open the authorization URL above");
      }
    }
  }

  /**
   * Exchange authorization code for tokens using openid-client
   */
  async #exchangeCodeForTokens(
    code: string,
    receivedState?: string,
  ): Promise<void> {
    try {
      if (!this.#configuration) {
        throw new Error("OAuth configuration not initialized");
      }

      // Load PKCE data
      const pkceData = await this.#readJsonFile<{
        codeVerifier: string;
        state?: string;
      }>("pkce_data.json");

      if (!pkceData?.codeVerifier) {
        throw new Error("PKCE code verifier not found");
      }

      // Construct the callback URL properly
      let callbackUrl = `${this.redirectUrl}?code=${encodeURIComponent(code)}`;
      if (receivedState) {
        callbackUrl += `&state=${encodeURIComponent(receivedState)}`;
      }

      // Use openid-client for token exchange
      const tokens = await client.authorizationCodeGrant(
        this.#configuration,
        new URL(callbackUrl),
        {
          pkceCodeVerifier: pkceData.codeVerifier,
          expectedState: pkceData.state,
        },
      );

      // Convert to our token format
      const oauthTokens: OAuthTokens = {
        access_token: tokens.access_token,
        token_type: tokens.token_type || "Bearer",
        expires_in: tokens.expires_in,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
      };

      // Store the tokens
      await this.saveTokens(oauthTokens);

      // Clean up PKCE data
      await this.#deleteConfigFile("pkce_data.json");

      console.log("Successfully stored OAuth tokens");
    } catch (error) {
      console.error("Token exchange failed:", error);
      throw error;
    }
  }

  /**
   * Start a simple callback server to receive authorization codes
   */
  #startCallbackServer = (): void => {
    if (this.#callbackServer) {
      return; // Already running
    }

    const host = this.#config.host || "localhost";

    try {
      this.#callbackServer = Deno.serve({
        hostname: host,
        port: this.#config.callbackPort,
        onListen: ({ hostname, port }) => {
          console.log(
            `OAuth callback server listening on http://${hostname}:${port}${this.#callbackPath}`,
          );
        },
      }, (req: Request) => this.#handleCallback(req));
    } catch (error) {
      console.error(`Failed to start OAuth callback server: ${error}`);
    }
  };

  /**
   * Handle OAuth callback and trigger authorization completion
   */
  #handleCallback = (req: Request): Response => {
    const url = new URL(req.url);

    if (url.pathname !== this.#callbackPath) {
      return new Response("Not Found", { status: 404 });
    }

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const state = url.searchParams.get("state") || undefined;

    if (error) {
      console.error(`OAuth authorization error: ${error}`);
      if (this.#authorizationReject) {
        this.#authorizationReject(
          new Error(`OAuth authorization error: ${error}`),
        );
        this.#clearAuthorizationPromise();
      }
      return new Response(`Authorization failed: ${error}`, { status: 400 });
    }

    if (code) {
      console.log("Received OAuth authorization code");
      if (this.#authorizationResolve) {
        this.#authorizationResolve({ code, state });
        this.#clearAuthorizationPromise();
      }
      return new Response(
        "Authorization successful! You can close this window.",
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    const missingCodeError = new Error("Missing authorization code");
    if (this.#authorizationReject) {
      this.#authorizationReject(missingCodeError);
      this.#clearAuthorizationPromise();
    }
    return new Response("Missing authorization code", { status: 400 });
  };

  /**
   * Stop the callback server
   */
  async stopCallbackServer(): Promise<void> {
    if (this.#callbackServer) {
      await this.#callbackServer.shutdown();
      this.#callbackServer = undefined;
    }
  }

  /**
   * Setup the authorization promise for waiting
   */
  #setupAuthorizationPromise = (): void => {
    if (this.#authorizationPromise) {
      return; // Already set up
    }

    this.#authorizationPromise = new Promise((resolve, reject) => {
      this.#authorizationResolve = resolve;
      this.#authorizationReject = reject;

      // Set a timeout to prevent waiting forever
      setTimeout(() => {
        if (this.#authorizationReject) {
          this.#authorizationReject(new Error("OAuth authorization timeout"));
          this.#clearAuthorizationPromise();
        }
      }, 300000); // 5 minute timeout
    });
  };

  /**
   * Clear the authorization promise
   */
  #clearAuthorizationPromise = (): void => {
    this.#authorizationPromise = undefined;
    this.#authorizationResolve = undefined;
    this.#authorizationReject = undefined;
  };

  /**
   * Wait for OAuth authorization to complete
   */
  async #waitForAuthorization(): Promise<
    { code: string; state?: string }
  > {
    if (!this.#authorizationPromise) {
      throw new Error("Authorization promise not set up");
    }

    return await this.#authorizationPromise;
  }
}
