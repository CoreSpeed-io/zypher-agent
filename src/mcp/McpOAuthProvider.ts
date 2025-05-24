/**
 * Model Context Protocol OAuth Provider Implementation
 *
 * This implementation follows the mcp-remote project approach:
 * - Uses server URL hashing for file identification
 * - Relies on MCP SDK's built-in OAuth handling
 * - Simple file storage with hash prefixes
 * - No complex callback server logic
 */

import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { join } from "@std/path";

export interface IMcpOAuthProviderConfig {
  // Server URL for the MCP server
  serverUrl: string;
  // Port for the OAuth callback server
  callbackPort: number;
  // Desired hostname for the OAuth callback server (default: localhost)
  host?: string;
  // Path for the OAuth callback endpoint (default: /oauth/callback)
  callbackPath?: string;
  // Directory to store OAuth credentials
  storagePath: string;
  // Client name to use for OAuth registration (default: zypher-agent)
  clientName?: string;
  // Client URI to use for OAuth registration
  clientUri?: string;
  // Software ID to use for OAuth registration
  softwareId?: string;
  // Software version to use for OAuth registration
  softwareVersion?: string;
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
 * Implements OAuth 2.1 authentication for MCP clients, following mcp-remote patterns
 * This provider is stateless and relies on the MCP SDK for OAuth flow handling
 */
export class McpOAuthProvider implements OAuthClientProvider {
  private config: IMcpOAuthProviderConfig;
  private serverUrlHash: string;
  private callbackPath: string;
  private clientName: string;
  private clientUri: string;
  private softwareId: string;
  private softwareVersion: string;

  constructor(config: IMcpOAuthProviderConfig) {
    this.config = config;
    // Note: We'll compute the hash lazily when needed since it's async
    this.serverUrlHash = "";
    this.callbackPath = config.callbackPath || "/oauth/callback";
    this.clientName = config.clientName || "zypher-agent";
    this.clientUri = config.clientUri ||
      "https://github.com/spenciefy/zypher-agent";
    this.softwareId = config.softwareId || "zypher-agent";
    this.softwareVersion = config.softwareVersion || "1.0.0";
  }

  /**
   * Get or compute the server URL hash
   */
  private async getServerHash(): Promise<string> {
    if (!this.serverUrlHash) {
      this.serverUrlHash = await getServerUrlHash(this.config.serverUrl);
    }
    return this.serverUrlHash;
  }

  /**
   * The URL to redirect the user agent to after authorization
   */
  get redirectUrl(): string {
    const host = this.config.host || "localhost";
    return `http://${host}:${this.config.callbackPort}${this.callbackPath}`;
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
      client_name: this.clientName,
      client_uri: this.clientUri,
      software_id: this.softwareId,
      software_version: this.softwareVersion,
    };
  }

  /**
   * Ensure the storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await Deno.mkdir(this.config.storagePath, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        console.error("Failed to create storage directory:", error);
        throw error;
      }
    }
  }

  /**
   * Gets the file path for a config file
   * @param filename The name of the file
   * @returns The absolute file path
   */
  private async getConfigFilePath(filename: string): Promise<string> {
    const hash = await this.getServerHash();
    return join(this.config.storagePath, `${hash}_${filename}`);
  }

  /**
   * Reads a JSON file and parses it
   * @param filename The name of the file to read
   * @returns The parsed file content or undefined if the file doesn't exist
   */
  private async readJsonFile<T>(filename: string): Promise<T | undefined> {
    try {
      await this.ensureStorageDir();
      const filePath = await this.getConfigFilePath(filename);
      const content = await Deno.readTextFile(filePath);
      return JSON.parse(content) as T;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return undefined;
      }
      console.error(`Error reading ${filename}:`, error);
      return undefined;
    }
  }

  /**
   * Writes a JSON object to a file
   * @param filename The name of the file to write
   * @param data The data to write
   */
  private async writeJsonFile(filename: string, data: unknown): Promise<void> {
    try {
      await this.ensureStorageDir();
      const filePath = await this.getConfigFilePath(filename);
      await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Error writing ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Reads a text file
   * @param filename The name of the file to read
   * @returns The file content as a string or undefined if not found
   */
  private async readTextFile(filename: string): Promise<string | undefined> {
    try {
      await this.ensureStorageDir();
      const filePath = await this.getConfigFilePath(filename);
      return await Deno.readTextFile(filePath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return undefined;
      }
      console.error(`Error reading ${filename}:`, error);
      return undefined;
    }
  }

  /**
   * Writes a text string to a file
   * @param filename The name of the file to write
   * @param text The text to write
   */
  private async writeTextFile(filename: string, text: string): Promise<void> {
    try {
      await this.ensureStorageDir();
      const filePath = await this.getConfigFilePath(filename);
      await Deno.writeTextFile(filePath, text);
    } catch (error) {
      console.error(`Error writing ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Deletes a configuration file
   * @param filename The name of the file to delete
   */
  private async deleteConfigFile(filename: string): Promise<void> {
    try {
      const filePath = await this.getConfigFilePath(filename);
      await Deno.remove(filePath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.error(`Error deleting ${filename}:`, error);
      }
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

    // Note: We can't reliably check expiration without storing the issue time
    // Let the MCP SDK handle token refresh as needed

    return tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.writeJsonFile("tokens.json", tokens);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.writeTextFile("code_verifier.txt", codeVerifier);
  }

  async codeVerifier(): Promise<string> {
    const verifier = await this.readTextFile("code_verifier.txt");
    if (!verifier) {
      throw new Error("No code verifier found");
    }
    return verifier;
  }

  /**
   * Clears all stored authentication data
   */
  public async clearAuthData(): Promise<void> {
    await this.deleteConfigFile("client_info.json");
    await this.deleteConfigFile("tokens.json");
    await this.deleteConfigFile("code_verifier.txt");
    await this.stopCallbackServer();
  }

  /**
   * Redirects to authorization URL and waits for callback
   * This method should complete the full OAuth authorization flow
   * @param authorizationUrl The authorization URL to redirect to
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    console.log("Opening authorization URL:", authorizationUrl.toString());

    // Start callback server and setup promise for authorization result
    this.startCallbackServer();
    this.setupAuthorizationPromise();

    // Open browser
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

    // Wait for the authorization to complete
    console.log("Waiting for OAuth authorization...");
    const authResult = await this.waitForAuthorization();
    console.log("OAuth authorization completed, exchanging code for tokens...");

    // Exchange authorization code for tokens
    await this.exchangeCodeForTokens(authResult.code, authorizationUrl);
    console.log("Token exchange completed successfully");
  }

  private callbackServer?: Deno.HttpServer;
  private authorizationPromise?: Promise<{ code: string; state?: string }>;
  private authorizationResolve?: (
    value: { code: string; state?: string },
  ) => void;
  private authorizationReject?: (reason: unknown) => void;

  /**
   * Start a simple callback server to receive authorization codes
   */
  private startCallbackServer(): void {
    if (this.callbackServer) {
      return; // Already running
    }

    const host = this.config.host || "localhost";

    try {
      this.callbackServer = Deno.serve({
        hostname: host,
        port: this.config.callbackPort,
        onListen: ({ hostname, port }) => {
          console.log(
            `OAuth callback server listening on http://${hostname}:${port}${this.callbackPath}`,
          );
        },
      }, (req: Request) => this.handleCallback(req));
    } catch (error) {
      console.error(`Failed to start OAuth callback server: ${error}`);
    }
  }

  /**
   * Handle OAuth callback and trigger authorization completion
   */
  private handleCallback(req: Request): Response {
    const url = new URL(req.url);

    if (url.pathname !== this.callbackPath) {
      return new Response("Not Found", { status: 404 });
    }

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const state = url.searchParams.get("state") || undefined;

    if (error) {
      console.error(`OAuth authorization error: ${error}`);
      if (this.authorizationReject) {
        this.authorizationReject(
          new Error(`OAuth authorization error: ${error}`),
        );
        this.clearAuthorizationPromise();
      }
      return new Response(`Authorization failed: ${error}`, { status: 400 });
    }

    if (code) {
      console.log("Received OAuth authorization code");
      if (this.authorizationResolve) {
        this.authorizationResolve({ code, state });
        this.clearAuthorizationPromise();
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
    if (this.authorizationReject) {
      this.authorizationReject(missingCodeError);
      this.clearAuthorizationPromise();
    }
    return new Response("Missing authorization code", { status: 400 });
  }

  /**
   * Stop the callback server
   */
  async stopCallbackServer(): Promise<void> {
    if (this.callbackServer) {
      await this.callbackServer.shutdown();
      this.callbackServer = undefined;
      console.log("OAuth callback server stopped");
    }
  }

  /**
   * Setup the authorization promise for waiting
   */
  private setupAuthorizationPromise(): void {
    if (this.authorizationPromise) {
      return; // Already set up
    }

    this.authorizationPromise = new Promise((resolve, reject) => {
      this.authorizationResolve = resolve;
      this.authorizationReject = reject;

      // Set a timeout to prevent waiting forever
      setTimeout(() => {
        if (this.authorizationReject) {
          this.authorizationReject(new Error("OAuth authorization timeout"));
          this.clearAuthorizationPromise();
        }
      }, 300000); // 5 minute timeout
    });
  }

  /**
   * Clear the authorization promise and callbacks
   */
  private clearAuthorizationPromise(): void {
    this.authorizationPromise = undefined;
    this.authorizationResolve = undefined;
    this.authorizationReject = undefined;
  }

  /**
   * Wait for OAuth authorization to complete
   */
  private async waitForAuthorization(): Promise<
    { code: string; state?: string }
  > {
    if (!this.authorizationPromise) {
      throw new Error("Authorization promise not set up");
    }

    return await this.authorizationPromise;
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(
    code: string,
    _authorizationUrl: URL,
  ): Promise<void> {
    try {
      // Get client info and code verifier
      const clientInfo = await this.clientInformation();
      const codeVerifier = await this.codeVerifier();

      if (!clientInfo) {
        throw new Error("No client information found");
      }

      // Determine token endpoint URL
      // For Atlassian MCP, the token endpoint is typically at /v1/token
      const tokenUrl = new URL("/v1/token", this.config.serverUrl);

      // Prepare token exchange request
      const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: this.redirectUrl,
        client_id: clientInfo.client_id,
        code_verifier: codeVerifier,
      });

      // Make token exchange request
      console.log(`Exchanging code for tokens at: ${tokenUrl.toString()}`);
      const response = await fetch(tokenUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: tokenParams.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token exchange failed with status ${response.status}: ${errorText}`,
        );
      }

      const tokens = await response.json() as OAuthTokens;

      // Validate we got the required tokens
      if (!tokens.access_token) {
        throw new Error("No access token received from token exchange");
      }

      // Store the tokens
      await this.saveTokens(tokens);
      console.log("Successfully stored OAuth tokens");
    } catch (error) {
      console.error("Token exchange failed:", error);
      throw error;
    }
  }
}
