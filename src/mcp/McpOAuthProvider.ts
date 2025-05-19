/**
 * Model Context Protocol OAuth Provider Implementation
 *
 * This file implements an OAuth provider compatible with the MCP specification.
 * It follows the best practices for server-to-server authentication:
 * https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization
 *
 * The implementation:
 * - Implements Client Credentials OAuth 2.1 flow for server-to-server authentication
 * - Uses secure token storage in the container environment
 * - Supports dynamic client registration
 * - Implements token refresh and rotation
 */

import {
  OAuthClientProvider,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { join } from "path";
import { access, mkdir, readFile, unlink, writeFile } from "fs/promises";

export interface IMcpOAuthProviderConfig {
  // Client information
  clientName: string;
  clientVersion: string;
  // Storage paths
  storagePath?: string;
  // Optional scope for authorization
  scope?: string;
  // Optional client ID and secret for pre-registered clients
  clientId?: string;
  clientSecret?: string;
  // Option to disable token expiry validation (not recommended)
  disableExpiryCheck?: boolean;
}

/**
 * Implements OAuth 2.1 authentication for MCP clients in server environments
 */
export class McpOAuthProvider implements OAuthClientProvider {
  private config: IMcpOAuthProviderConfig & {
    storagePath: string;
  };
  private _redirectUrl = "urn:ietf:wg:oauth:2.0:oob"; // Out-of-band URL for non-browser flows

  constructor(config: IMcpOAuthProviderConfig) {
    this.config = {
      ...config,
      storagePath: config.storagePath ??
        join(Deno.env.get("HOME") || "/tmp", ".zypher", "oauth"),
    };
  }

  /**
   * The URL to redirect the user agent to after authorization
   * For server-to-server auth, we use an out-of-band URL
   */
  get redirectUrl(): string | URL {
    return this._redirectUrl;
  }

  /**
   * Metadata about this OAuth client for dynamic registration
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.config.clientName,
      software_version: this.config.clientVersion,
      redirect_uris: [this._redirectUrl],
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["client_credentials", "refresh_token"],
      scope: this.config.scope,
    };
  }

  /**
   * Initialize storage directory
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await mkdir(this.config.storagePath, { recursive: true });
    } catch (error) {
      console.error("Failed to create storage directory:", error);
      throw new Error("Failed to initialize OAuth storage");
    }
  }

  /**
   * Get the path to the client info file
   */
  private getClientInfoPath(): string {
    return join(this.config.storagePath, "client_info.json");
  }

  /**
   * Get the path to the tokens file
   */
  private getTokensPath(): string {
    return join(this.config.storagePath, "tokens.json");
  }

  /**
   * Get the path to the code verifier file
   */
  private getCodeVerifierPath(): string {
    return join(this.config.storagePath, "code_verifier.txt");
  }

  /**
   * Load client information from storage
   */
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    try {
      // If client ID and secret are provided directly in config, use those
      if (this.config.clientId) {
        return {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        };
      }

      // Otherwise, try to load from storage
      const clientInfoPath = this.getClientInfoPath();

      try {
        await access(clientInfoPath);
      } catch {
        // File doesn't exist
        return undefined;
      }

      const data = await readFile(clientInfoPath, "utf-8");
      return JSON.parse(data) as OAuthClientInformation;
    } catch (error) {
      console.error("Failed to load client information:", error);
      return undefined;
    }
  }

  /**
   * Save client information to storage
   */
  async saveClientInformation(
    clientInformation: OAuthClientInformationFull,
  ): Promise<void> {
    try {
      await this.ensureStorageDir();
      const clientInfoPath = this.getClientInfoPath();
      await writeFile(
        clientInfoPath,
        JSON.stringify(clientInformation, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("Failed to save client information:", error);
      throw new Error("Failed to save client information");
    }
  }

  /**
   * Load tokens from storage and check if they're valid
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    try {
      const tokensPath = this.getTokensPath();

      try {
        await access(tokensPath);
      } catch {
        // File doesn't exist
        return undefined;
      }

      const data = await readFile(tokensPath, "utf-8");
      const tokens = JSON.parse(data) as OAuthTokens & { expiry?: number };

      // Check if tokens are expired (unless explicitly disabled)
      if (
        !this.config.disableExpiryCheck && tokens.expiry &&
        tokens.expiry < Date.now()
      ) {
        console.log("Tokens expired, will attempt to refresh");
        return undefined;
      }

      return tokens;
    } catch (error) {
      console.error("Failed to load tokens:", error);
      return undefined;
    }
  }

  /**
   * Save tokens to storage with expiry time
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    try {
      await this.ensureStorageDir();

      // Calculate expiry time if available (with 30s buffer for safety)
      const expiry = tokens.expires_in
        ? Date.now() + (tokens.expires_in * 1000) - 30000
        : undefined;

      const tokensPath = this.getTokensPath();
      await writeFile(
        tokensPath,
        JSON.stringify({ ...tokens, expiry }, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("Failed to save tokens:", error);
      throw new Error("Failed to save tokens");
    }
  }

  /**
   * Redirect to authorization URL
   * For server-to-server auth using Client Credentials flow, this should never be called.
   * If it is, it means we're trying to use Authorization Code flow which isn't suitable
   * for headless environments.
   */
  redirectToAuthorization(_authorizationUrl: URL): Promise<void> {
    console.error(
      "ERROR: OAuth authorization redirect requested in server environment",
    );
    console.error(
      "This indicates an attempt to use Authorization Code flow instead of Client Credentials flow",
    );
    console.error(
      "For server-to-server authentication, ensure you are using Client Credentials flow",
    );

    throw new Error(
      "Authorization redirect not supported in server environment",
    );
  }

  /**
   * Save code verifier for PKCE
   * Not typically needed for Client Credentials flow, but implemented for completeness
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    try {
      await this.ensureStorageDir();
      const verifierPath = this.getCodeVerifierPath();
      await writeFile(verifierPath, codeVerifier, "utf-8");
    } catch (error) {
      console.error("Failed to save code verifier:", error);
      throw new Error("Failed to save code verifier");
    }
  }

  /**
   * Get saved code verifier
   * Not typically needed for Client Credentials flow, but implemented for completeness
   */
  async codeVerifier(): Promise<string> {
    try {
      const verifierPath = this.getCodeVerifierPath();
      const verifier = await readFile(verifierPath, "utf-8");
      if (!verifier) {
        throw new UnauthorizedError("Code verifier not found");
      }
      return verifier;
    } catch {
      throw new UnauthorizedError("Code verifier not found");
    }
  }

  /**
   * Clear all stored OAuth data
   * Useful for forcing re-authentication or resolving auth issues
   */
  public async clearAuthData(): Promise<void> {
    try {
      await this.ensureStorageDir();
      const tokensPath = this.getTokensPath();
      const clientInfoPath = this.getClientInfoPath();
      const verifierPath = this.getCodeVerifierPath();

      // Remove files if they exist
      for (const path of [tokensPath, clientInfoPath, verifierPath]) {
        try {
          await access(path);
          await unlink(path);
        } catch (_error) {
          // File doesn't exist, ignore
        }
      }
    } catch (_error) {
      console.error("Failed to clear auth data");
    }
  }
}
