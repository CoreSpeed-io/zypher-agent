import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  type OAuthClientInformationFull,
  OAuthClientInformationFullSchema,
  type OAuthTokens,
  OAuthTokensSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthProviderOptions } from "../types/auth.ts";
import { Completer } from "../../utils/completer.ts";
import {
  deleteConfigFile,
  readJsonFile,
  readTextFile,
  writeJsonFile,
  writeTextFile,
} from "./config.ts";
import { getServerUrlHash } from "./config.ts";

/**
 * Implements the OAuthClientProvider interface for Node.js environments.
 * Handles OAuth flow and token storage for MCP clients.
 */
export class McpOAuthClientProvider implements OAuthClientProvider {
  #serverUrlHash: string;
  #callbackPath: string;
  #clientName: string;
  #clientUri: string;
  #softwareId: string;
  #softwareVersion: string;

  /**
   * Creates a new McpOAuthClientProvider
   * @param options Configuration options for the provider
   */
  constructor(
    readonly options?: OAuthProviderOptions,
    onRedirect?: (url: string) => Promise<void>,
  ) {
    // Initialize serverUrlHash asynchronously since getServerUrlHash returns a Promise
    this.#serverUrlHash = ""; // Will be set in initialize()
    this.#callbackPath = options?.callbackPath || "/mcp/oauth/callback";
    this.#clientName = options?.clientName || "MCP CLI Client";
    this.#clientUri = options?.clientUri ||
      "https://github.com/modelcontextprotocol/mcp-cli";
    this.#softwareId = options?.softwareId ||
      "9466000b-baa3-4d20-bd33-46cd9a3411ce";
    this.#softwareVersion = options?.softwareVersion || "0.1.0";
    this._onRedirect = onRedirect || (async (url) => {
      await console.log(`Redirect to: ${url.toString()}`);
    });
  }

  private _onRedirect: (url: string) => void;
  private _callbackServer: Deno.HttpServer | null = null;
  private _completer?: Completer<boolean>;
  private _currentState: string | null = null;

  async initialize() {
    this.#serverUrlHash = await getServerUrlHash(this.options?.serverUrl ?? "");
  }

  get redirectUrl(): string {
    return `http://${this.options?.host}:${this.options?.callbackPort}${this.#callbackPath}`;
  }

  get clientMetadata() {
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
   * Gets the client information if it exists
   * @returns The client information or undefined
   */
  async clientInformation(): Promise<OAuthClientInformationFull | undefined> {
    // log('Reading client info')
    return await readJsonFile<OAuthClientInformationFull>(
      this.#serverUrlHash,
      "client_info.json",
      OAuthClientInformationFullSchema,
    );
  }

  /**
   * Saves client information
   * @param clientInformation The client information to save
   */
  async saveClientInformation(
    clientInformation: OAuthClientInformationFull,
  ): Promise<void> {
    // log('Saving client info')
    await writeJsonFile(
      this.#serverUrlHash,
      "client_info.json",
      clientInformation,
    );
  }

  /**
   * Gets the OAuth tokens if they exist
   * @returns The OAuth tokens or undefined
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    // log('Reading tokens')
    // console.log(new Error().stack)
    return await readJsonFile<OAuthTokens>(
      this.#serverUrlHash,
      "tokens.json",
      OAuthTokensSchema,
    );
  }

  /**
   * Saves OAuth tokens
   * @param tokens The tokens to save
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    // log('Saving tokens')
    await writeJsonFile(this.#serverUrlHash, "tokens.json", tokens);
  }

  /**
   * Redirects the user to the authorization URL
   * @param authorizationUrl The URL to redirect to
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    // Generate and add state parameter for CSRF protection
    const state = this._generateState();
    await this._saveState(state);

    // Add state parameter to authorization URL
    const urlWithState = new URL(authorizationUrl.toString());
    urlWithState.searchParams.set("state", state);

    // Start the OAuth flow with callback server
    console.log("Starting OAuth flow with callback server...");
    await this.startOAuthFlow(urlWithState);
  }

  /**
   * Generates a random state parameter for CSRF protection
   * @returns Random state string
   */
  private _generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }

  /**
   * Saves the state parameter
   * @param state The state to save
   */
  private async _saveState(state: string): Promise<void> {
    this._currentState = state;
    await writeTextFile(this.#serverUrlHash, "oauth_state.txt", state);
  }

  /**
   * Gets the saved state parameter
   * @returns The saved state
   */
  private async _getSavedState(): Promise<string | null> {
    try {
      return await readTextFile(
        this.#serverUrlHash,
        "oauth_state.txt",
        "No OAuth state saved for session",
      );
    } catch {
      return null;
    }
  }

  /**
   * Exchanges authorization code for access tokens
   * @param code The authorization code
   */
  private async _exchangeCodeForTokens(code: string): Promise<void> {
    const clientInfo = await this.clientInformation();
    if (!clientInfo) {
      throw new Error("No client information available for token exchange");
    }

    const codeVerifier = await this.codeVerifier();
    if (!codeVerifier) {
      throw new Error("No PKCE code verifier available for token exchange");
    }

    // Determine token endpoint URL
    const serverUrl = this.options?.serverUrl;
    if (!serverUrl) {
      throw new Error("No server URL configured for token exchange");
    }

    // First try to discover the token endpoint from OAuth metadata
    let discoveredTokenEndpoint: string | null = null;
    try {
      const wellKnownUrl = `${
        new URL(serverUrl).origin
      }/.well-known/oauth-authorization-server`;
      console.log(`Attempting OAuth discovery at: ${wellKnownUrl}`);

      const discoveryResponse = await fetch(wellKnownUrl);
      if (discoveryResponse.ok) {
        const metadata = await discoveryResponse.json();
        if (metadata.token_endpoint) {
          discoveredTokenEndpoint = metadata.token_endpoint;
          console.log(`Discovered token endpoint: ${discoveredTokenEndpoint}`);
        }
      }
    } catch {
      console.log("OAuth discovery failed, falling back to standard endpoints");
    }

    // Prepare list of endpoints to try
    const possibleTokenEndpoints = [];

    // Add discovered endpoint first if available
    if (discoveredTokenEndpoint) {
      possibleTokenEndpoints.push(discoveredTokenEndpoint);
    }

    // Add common OAuth token endpoint patterns
    possibleTokenEndpoints.push(
      `${serverUrl}/oauth/token`,
      `${serverUrl}/token`,
      `${new URL(serverUrl).origin}/oauth/token`,
      `${new URL(serverUrl).origin}/token`,
    );

    let tokenResponse;
    let lastError;

    for (const tokenEndpoint of possibleTokenEndpoints) {
      try {
        console.log(`Attempting token exchange at: ${tokenEndpoint}`);

        const tokenRequest: Record<string, string> = {
          grant_type: "authorization_code",
          code: code,
          redirect_uri: this.redirectUrl,
          client_id: clientInfo.client_id,
          code_verifier: codeVerifier,
        };

        // Prepare headers
        const headers: Record<string, string> = {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        };

        // Try different authentication methods
        let response;

        // Method 1: Basic auth with client credentials (if available)
        if (clientInfo.client_secret) {
          try {
            const auth = btoa(
              `${clientInfo.client_id}:${clientInfo.client_secret}`,
            );
            const authHeaders = { ...headers, Authorization: `Basic ${auth}` };
            console.log("Attempting Basic authentication");

            response = await fetch(tokenEndpoint, {
              method: "POST",
              headers: authHeaders,
              body: new URLSearchParams(tokenRequest),
            });

            if (!response.ok) {
              console.log(`Basic auth failed: ${response.status}`);
            }
          } catch (basicAuthError) {
            console.log("Basic auth attempt failed:", basicAuthError);
          }
        }

        // Method 2: Client secret in form data (if Basic auth failed)
        if (!response || !response.ok) {
          try {
            const formRequest = { ...tokenRequest };
            if (clientInfo.client_secret) {
              formRequest.client_secret = clientInfo.client_secret;
              console.log("Attempting form-based client authentication");
            } else {
              console.log("Attempting public client (no authentication)");
            }

            response = await fetch(tokenEndpoint, {
              method: "POST",
              headers,
              body: new URLSearchParams(formRequest),
            });
          } catch (formAuthError) {
            console.log("Form-based auth attempt failed:", formAuthError);
            throw formAuthError;
          }
        }

        if (response.ok) {
          tokenResponse = await response.json();
          console.log("Token exchange successful!");
          break;
        } else {
          const errorText = await response.text();
          lastError = new Error(
            `Token exchange failed (${response.status}): ${errorText}`,
          );
          console.log(
            `Token exchange failed at ${tokenEndpoint}: ${response.status} ${errorText}`,
          );
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`Token exchange error at ${tokenEndpoint}:`, error);
      }
    }

    if (!tokenResponse) {
      throw lastError || new Error("All token endpoints failed");
    }

    // Validate and save tokens
    try {
      const tokens = OAuthTokensSchema.parse(tokenResponse);
      await this.saveTokens(tokens);
      console.log("OAuth tokens saved successfully");
    } catch (parseError) {
      console.error("Failed to parse token response:", parseError);
      console.error("Token response was:", tokenResponse);
      throw new Error(
        `Invalid token response format: ${
          parseError instanceof Error ? parseError.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Starts the OAuth flow by providing the authorization URL to the frontend.
   * Returns a Promise that resolves once the frontend completes authentication
   * and calls back to `handleOAuthCallback`.
   *
   * @param authorizationUrl The authorization URL to redirect to
   * @returns Promise that resolves to the authentication result (true/false)
   */
  startOAuthFlow(authorizationUrl: URL): Promise<boolean> {
    // If a flow is already in progress, return the existing promise
    if (this._completer) {
      return this._completer.wait();
    }

    this._completer = new Completer<boolean>();

    console.log(
      "Starting OAuth flow - providing authorization URL to frontend",
    );
    this._onRedirect(authorizationUrl.toString());

    return this._completer.wait();
  }

  /**
   * Handles OAuth callback from the frontend
   * @param code OAuth authorization code
   * @param state OAuth state parameter
   * @returns Promise resolving to success status
   */
  async handleOAuthCallback(code: string, state: string): Promise<boolean> {
    try {
      // Validate state parameter for CSRF protection
      const savedState = await this._getSavedState();
      if (!savedState || state !== savedState) {
        console.log("OAuth state validation failed");
        // Resolve pending promise as false if exists
        this._completer?.resolve(false);
        this._completer = undefined;
        return false;
      }

      console.log(
        `OAuth callback received with code: ${
          code.substring(0, 10)
        }... and valid state`,
      );

      // Exchange authorization code for access tokens
      await this._exchangeCodeForTokens(code);
      console.log("OAuth tokens exchanged successfully");
      // Resolve pending promise as true
      this._completer?.resolve(true);
      this._completer = undefined;
      return true;
    } catch (error) {
      console.error("OAuth callback processing failed:", error);
      // Resolve pending promise as false
      this._completer?.resolve(false);
      this._completer = undefined;
      return false;
    }
  }

  /**
   * Saves the PKCE code verifier
   * @param codeVerifier The code verifier to save
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    // log('Saving code verifier')
    await writeTextFile(this.#serverUrlHash, "code_verifier.txt", codeVerifier);
  }

  /**
   * Gets the PKCE code verifier
   * @returns The code verifier
   */
  async codeVerifier(): Promise<string> {
    // log('Reading code verifier')
    return await readTextFile(
      this.#serverUrlHash,
      "code_verifier.txt",
      "No code verifier saved for session",
    );
  }

  async clearOAuthData(): Promise<void> {
    await deleteConfigFile(this.#serverUrlHash, "tokens.json");
    await deleteConfigFile(this.#serverUrlHash, "client_info.json");
    await deleteConfigFile(this.#serverUrlHash, "code_verifier.txt");
    await deleteConfigFile(this.#serverUrlHash, "oauth_state.txt");
  }

  /**
   * Cleans up OAuth data
   */
  async cleanup(): Promise<void> {
    // Reset auth state
    this._completer = undefined;
    this._currentState = null;
    await this.clearOAuthData();
  }
}
