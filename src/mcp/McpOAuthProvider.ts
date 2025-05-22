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
 * - Supports dynamic client registration (DCR) per RFC 7591/7592
 * - Implements token refresh and rotation
 * - Falls back to Authorization Code flow with PKCE when Client Credentials is not supported
 * - Includes Device Code flow as an intermediate fallback option
 */

import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { join } from "@std/path";
import {
  createBasicAuthHeader,
  findAvailablePort,
  generateCodeChallenge,
  generateRandomString,
} from "./utils.ts";

export interface IMcpOAuthProviderConfig {
  // Client information
  clientId?: string;
  clientSecret?: string;
  clientName: string;
  clientVersion: string;
  // Storage path for tokens and client info
  storagePath: string;
  // Server identifier for storing tokens and client info
  serverId: string;
  // Server URL for the MCP server
  serverUrl: string;
  // OAuth scopes to request
  scope?: string;
  // Disable token expiry check (for testing)
  disableExpiryCheck?: boolean;
  // Force using Client Credentials flow
  useClientCredentialsFlow?: boolean;
  // Use dynamic client registration
  useDynamicRegistration?: boolean;
}

/**
 * Implements OAuth 2.1 authentication for MCP clients in server environments
 */
export class McpOAuthProvider implements OAuthClientProvider {
  private config: IMcpOAuthProviderConfig & {
    storagePath: string;
  };
  private _redirectUrl = "urn:ietf:wg:oauth:2.0:oob"; // Out-of-band URL for non-browser flows
  private oauthCallbackPort?: number;
  private oauthRedirectUri?: string;
  private authorizationEndpoint?: string;
  private tokenEndpoint?: string;
  private registrationEndpoint?: string;
  private _codeVerifier?: string;
  private state?: string;

  constructor(config: IMcpOAuthProviderConfig) {
    this.config = {
      ...config,
      // Ensure scope is set
      scope: config.scope || "tools",
      // Default to checking expiry
      disableExpiryCheck: config.disableExpiryCheck || false,
      // Default to using Client Credentials flow for server-to-server auth
      useClientCredentialsFlow: config.useClientCredentialsFlow !== false,
      // Enable dynamic client registration by default
      useDynamicRegistration: config.useDynamicRegistration !== false,
    };
  }

  /**
   * The URL to redirect the user agent to after authorization
   * For server-to-server auth, we use an out-of-band URL
   */
  get redirectUrl(): string | URL {
    // Use a local callback URL for all MCP servers for better compatibility
    // Many OAuth servers don't support OOB URIs
    return this.oauthRedirectUri || this._redirectUrl;
  }

  /**
   * Metadata about this OAuth client for dynamic registration
   */
  get clientMetadata(): OAuthClientMetadata {
    // For Docker environments, prioritize the out-of-band redirect URI
    const oobUri = "urn:ietf:wg:oauth:2.0:oob";
    // For Atlassian, we need to use a local callback URL
    const localCallbackUri = this.oauthRedirectUri ||
      "http://localhost:3001/oauth/callback";

    // Base metadata for all OAuth servers
    const metadata: OAuthClientMetadata = {
      client_name: this.config.clientName,
      software_id: `zypher-agent-${this.config.serverId}`,
      software_version: this.config.clientVersion,
      token_endpoint_auth_method: "client_secret_basic",
      scope: this.config.scope,
      // Initialize with empty array to satisfy type requirements
      redirect_uris: [],
    };

    // Use a local callback URL for all MCP servers for better compatibility
    // Many OAuth servers don't support OOB URIs
    metadata.redirect_uris = [localCallbackUri, oobUri];

    // Use a standard set of grant types that work with most OAuth servers
    // Prioritize authorization_code and refresh_token as they're most widely supported
    metadata.grant_types = [
      "authorization_code",
      "refresh_token",
      "client_credentials",
      "urn:ietf:params:oauth:grant-type:device_code",
    ];

    return metadata;
  }

  /**
      }
    }
    // If we can't find an available port, use a default
    console.warn(`Could not find an available port, using default: ${startPort + 1000}`);
    return startPort + 1000;
  }

  /**
   * Ensure the storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await Deno.mkdir(this.config.storagePath, { recursive: true });
    } catch (error) {
      console.error("Failed to create storage directory:", error);
      throw error;
    }
  }

  /**
   * Get the path to the client info file
   */
  private getClientInfoPath(): string {
    return join(this.config.storagePath, `${this.config.serverId}.client.json`);
  }

  /**
   * Get the path to the tokens file
   */
  private getTokensPath(): string {
    return join(this.config.storagePath, `${this.config.serverId}.tokens.json`);
  }

  /**
   * Get the path to the code verifier file
   */
  private getCodeVerifierPath(): string {
    return join(
      this.config.storagePath,
      `${this.config.serverId}.verifier.txt`,
    );
  }

  /**
   * Load client information from storage
   */
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    try {
      // Check if client info is provided in config
      if (this.config.clientId) {
        return {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        };
      }

      // Otherwise, try to load from storage
      await this.ensureStorageDir();
      const clientInfoPath = this.getClientInfoPath();

      try {
        const clientInfoJson = await Deno.readTextFile(clientInfoPath);
        const clientInfo = JSON.parse(clientInfoJson);
        return clientInfo;
      } catch (_error) {
        // File doesn't exist or is invalid JSON
        return undefined;
      }
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
      await Deno.writeTextFile(
        clientInfoPath,
        JSON.stringify(clientInformation, null, 2),
      );
    } catch (error) {
      console.error("Failed to save client information:", error);
      throw error;
    }
  }

  /**
   * Load tokens from storage and check if they're valid
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    try {
      await this.ensureStorageDir();
      const tokensPath = this.getTokensPath();

      try {
        const tokensJson = await Deno.readTextFile(tokensPath);
        const tokens = JSON.parse(tokensJson) as OAuthTokens & {
          expires_at?: number;
        };

        // Check if tokens are expired
        if (!this.config.disableExpiryCheck && tokens.expires_at) {
          const now = Date.now();
          if (now >= tokens.expires_at) {
            console.log("Tokens have expired, need to refresh");
            return undefined;
          }
        }

        return tokens;
      } catch (_error) {
        // File doesn't exist or is invalid JSON
        return undefined;
      }
    } catch (error) {
      console.error("Failed to load tokens:", error);
      return undefined;
    }
  }

  /**
   * Save tokens to storage
   * Adds an expiry timestamp based on expires_in value
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    try {
      await this.ensureStorageDir();
      const tokensPath = this.getTokensPath();

      // Add expiry timestamp if expires_in is provided
      const tokensWithExpiry = { ...tokens } as OAuthTokens & {
        expires_at?: number;
      };
      if (tokens.expires_in && !tokensWithExpiry.expires_at) {
        // Convert expires_in (seconds) to milliseconds and add to current time
        const expiresAt = Date.now() + (tokens.expires_in * 1000);
        tokensWithExpiry.expires_at = expiresAt;
      }

      await Deno.writeTextFile(
        tokensPath,
        JSON.stringify(tokensWithExpiry, null, 2),
      );
    } catch (error) {
      console.error("Failed to save tokens:", error);
      throw error;
    }
  }

  /**
   * Save code verifier for PKCE
   * Required for Authorization Code flow with PKCE
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    // Save in memory
    this._codeVerifier = codeVerifier;

    // Also save to disk for persistence
    await this.ensureStorageDir();
    const codeVerifierPath = this.getCodeVerifierPath();
    await Deno.writeTextFile(codeVerifierPath, codeVerifier);
  }

  /**
   * Get saved code verifier
   * Required for Authorization Code flow with PKCE
   */
  async codeVerifier(): Promise<string> {
    // If we have a code verifier in memory, use that
    if (this._codeVerifier) {
      return this._codeVerifier;
    }

    // Otherwise try to read from disk
    try {
      const codeVerifierPath = this.getCodeVerifierPath();
      const codeVerifier = await Deno.readTextFile(codeVerifierPath);
      return codeVerifier.trim();
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(
          "Code verifier not found. Please start the authorization process again.",
        );
      }
      throw error;
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
          await Deno.stat(path);
          await Deno.remove(path);
        } catch (_error) {
          // File doesn't exist, ignore
        }
      }
    } catch (_error) {
      console.error("Failed to clear auth data");
    }
  }

  /**
   * Prompt for authorization code in server environment
   */
  private promptForAuthorizationCode(): Promise<string> {
    console.log(
      "Setting up a local server to receive the authorization code...",
    );

    // IMPORTANT: Use exactly the same port that was set earlier for the redirect URI
    // Do not try to find a new port here to avoid port inconsistency
    if (!this.oauthCallbackPort) {
      throw new Error(
        "Callback port must be set before starting the callback server",
      );
    }

    const port = this.oauthCallbackPort;
    console.log(`Using callback port: ${port}`);

    return new Promise<string>((resolve, reject) => {
      // Create a simple HTTP server to receive the callback
      const callbackPath = "/oauth/callback";
      let controller: AbortController | null = null;

      // Set a timeout for the authorization process
      const timeoutId = setTimeout(() => {
        if (controller) {
          controller.abort();
        }
        reject(new Error("Authorization timed out after 10 minutes"));
      }, 10 * 60 * 1000); // 10 minutes timeout

      try {
        controller = new AbortController();
        const { signal } = controller;

        // Define the request handler
        const handler = (request: Request): Promise<Response> => {
          return Promise.resolve().then(() => {
            const url = new URL(request.url);

            // Check if this is the callback path
            if (url.pathname === callbackPath) {
              // Get the authorization code from the query parameters
              const code = url.searchParams.get("code");
              const _state = url.searchParams.get("state"); // Prefix with underscore to indicate intentionally unused
              const error = url.searchParams.get("error");

              if (error) {
                // Authorization was denied or failed
                clearTimeout(timeoutId);
                controller?.abort();
                reject(new Error(`Authorization failed: ${error}`));

                return new Response(
                  "Authorization failed. You can close this window.",
                  {
                    status: 400,
                    headers: { "Content-Type": "text/html" },
                  },
                );
              }

              if (code) {
                // Successfully received the authorization code
                clearTimeout(timeoutId);
                controller?.abort();
                resolve(code);

                return new Response(
                  `<html>
                    <head><title>Authorization Successful</title></head>
                    <body>
                      <h1>Authorization Successful</h1>
                      <p>You have successfully authorized the application.</p>
                      <p>You can close this window now.</p>
                    </body>
                  </html>`,
                  {
                    status: 200,
                    headers: { "Content-Type": "text/html" },
                  },
                );
              }

              // Missing code parameter
              return new Response("Invalid callback: missing code parameter", {
                status: 400,
                headers: { "Content-Type": "text/plain" },
              });
            } else {
              // Handle other requests
              return new Response("Not found", {
                status: 404,
                headers: { "Content-Type": "text/plain" },
              });
            }
          });
        };

        // Start the server
        Deno.serve({
          port,
          signal,
          handler,
          onListen: ({ port }) => {
            console.log(
              `Callback server listening at http://localhost:${port}${callbackPath}`,
            );
            console.log("Waiting for authorization code...");
          },
        });
      } catch (error) {
        console.error("Server error:", error);
        reject(
          new Error(
            `Failed to start callback server: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  }

  /**
   * Redirect to authorization URL
   * For server-to-server auth using Client Credentials flow, this should never be called.
   * If it is, it means we're trying to use Authorization Code flow which isn't suitable
   * for headless environments.
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (this.config.useClientCredentialsFlow) {
      console.log("OAuth redirect requested, using MCP authorization flow...");

      // Extract the base URL for the MCP server
      const mcpServerUrl =
        `${authorizationUrl.protocol}//${authorizationUrl.host}`;

      // For all MCP servers, we can directly use the well-known URL for OAuth metadata
      console.log(
        `Checking for OAuth metadata from MCP server: ${mcpServerUrl}`,
      );

      // Default authorization server URL to the MCP server URL
      const authorizationServerUrl = mcpServerUrl;

      // Step 3: Get the authorization server metadata if we don't already have the endpoints
      let tokenEndpoint = this.tokenEndpoint || "";
      let registrationEndpoint = this.registrationEndpoint || "";
      let deviceAuthorizationEndpoint = this.authorizationEndpoint || "";
      let authorizationEndpoint = this.authorizationEndpoint || "";

      // Only fetch metadata if we don't already have the endpoints
      if (!tokenEndpoint || !registrationEndpoint || !authorizationEndpoint) {
        try {
          const authServerMetadataUrl =
            `${authorizationServerUrl}/.well-known/oauth-authorization-server`;
          console.log(
            `Fetching authorization server metadata from: ${authServerMetadataUrl}`,
          );

          const authServerMetadataResponse = await fetch(authServerMetadataUrl);
          if (authServerMetadataResponse.ok) {
            const authServerMetadata = await authServerMetadataResponse.json();

            if (authServerMetadata.token_endpoint) {
              tokenEndpoint = authServerMetadata.token_endpoint;
              this.tokenEndpoint = tokenEndpoint;
              console.log(`Found token endpoint: ${tokenEndpoint}`);
            }

            if (authServerMetadata.registration_endpoint) {
              registrationEndpoint = authServerMetadata.registration_endpoint;
              this.registrationEndpoint = registrationEndpoint;
              console.log(
                `Found registration endpoint: ${registrationEndpoint}`,
              );
            }

            if (authServerMetadata.authorization_endpoint) {
              authorizationEndpoint = authServerMetadata.authorization_endpoint;
              this.authorizationEndpoint = authorizationEndpoint;
              console.log(
                `Found authorization endpoint: ${authorizationEndpoint}`,
              );
            }

            if (authServerMetadata.device_authorization_endpoint) {
              deviceAuthorizationEndpoint =
                authServerMetadata.device_authorization_endpoint;
              this.authorizationEndpoint = deviceAuthorizationEndpoint;
              console.log(
                `Found device authorization endpoint: ${deviceAuthorizationEndpoint}`,
              );
            }
          } else {
            console.log(
              `Failed to get authorization server metadata: ${authServerMetadataResponse.status}`,
            );
          }
        } catch (error) {
          console.log(`Error fetching authorization server metadata: ${error}`);
        }
      }

      // Fallback endpoints if discovery fails
      if (!tokenEndpoint) {
        // Use standard OAuth endpoint paths as fallbacks
        tokenEndpoint = `${authorizationServerUrl}/token`;
        registrationEndpoint = `${authorizationServerUrl}/register`;
        authorizationEndpoint = `${authorizationServerUrl}/authorize`;
        console.log(`Using standard token endpoint: ${tokenEndpoint}`);
        console.log(
          `Using standard registration endpoint: ${registrationEndpoint}`,
        );
        console.log(
          `Using standard authorization endpoint: ${authorizationEndpoint}`,
        );
      }

      // Step 4: Get client information (from config or storage)
      let clientInfo = await this.clientInformation();

      // If no client info and dynamic registration is enabled, register a new client
      if (
        !clientInfo && this.config.useDynamicRegistration &&
        registrationEndpoint
      ) {
        console.log(
          "No client credentials found, attempting dynamic registration...",
        );
        console.log(`Using registration endpoint: ${registrationEndpoint}`);
        console.log(
          `Client metadata: ${JSON.stringify(this.clientMetadata, null, 2)}`,
        );

        try {
          // Check for initial access token in environment variables
          const initialAccessToken = Deno.env.get(
            `MCP_${this.config.serverId.toUpperCase()}_INITIAL_ACCESS_TOKEN`,
          ) ||
            Deno.env.get("MCP_INITIAL_ACCESS_TOKEN");

          // Prepare registration request with proper metadata
          const metadata = {
            ...this.clientMetadata,
            // Add additional fields required by OAuth servers
            software_id: `zypher-agent-${this.config.serverId}`,
            software_version: this.config.clientVersion,
          };

          // Prepare headers
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Accept": "application/json",
          };

          // Add initial access token if available
          if (initialAccessToken) {
            headers["Authorization"] = `Bearer ${initialAccessToken}`;
            console.log("Using initial access token for registration");
          }

          const registrationResponse = await fetch(registrationEndpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(metadata),
          });

          if (registrationResponse.ok) {
            const registrationResult = await registrationResponse.json();
            console.log("Dynamic client registration successful");
            console.log(`Received client_id: ${registrationResult.client_id}`);

            // Save ALL fields returned by the registration endpoint
            await this.saveClientInformation(registrationResult);
            clientInfo = {
              client_id: registrationResult.client_id,
              client_secret: registrationResult.client_secret,
            };

            // Log registration management information if available
            if (
              registrationResult.registration_client_uri &&
              registrationResult.registration_access_token
            ) {
              console.log(
                `Registration management URI: ${registrationResult.registration_client_uri}`,
              );
              console.log(
                "Registration access token received - store this securely for client management",
              );
            }
          } else {
            const errorText = await registrationResponse.text();
            console.error(
              `Dynamic client registration failed: ${registrationResponse.status} - ${errorText}`,
            );

            // Try to extract more detailed error information
            try {
              const errorJson = JSON.parse(errorText);
              if (errorJson.error_description) {
                console.error(`Error details: ${errorJson.error_description}`);
              }
            } catch (_e) {
              // Not JSON, just use the text
            }
          }
        } catch (error) {
          console.error("Failed to register client:", error);
        }
      }

      // Step 5: If we have client info, request an access token
      if (clientInfo && clientInfo.client_id) {
        // Create Authorization header for Basic auth
        let authHeader = "";
        if (clientInfo.client_secret) {
          authHeader = createBasicAuthHeader(
            clientInfo.client_id,
            clientInfo.client_secret,
          );
        }

        // Set up token request parameters for client_credentials flow (ideal for Docker/server environments)
        const params = new URLSearchParams();
        params.append("client_id", clientInfo.client_id);
        params.append("grant_type", "client_credentials");
        if (this.config.scope) {
          params.append("scope", this.config.scope);
        }

        console.log(
          "Attempting Client Credentials flow (ideal for server-to-server in Docker)...",
        );
        console.log(
          "Note: Many cloud services don't support this flow and will require Authorization Code flow instead.",
        );
        try {
          // Always use HTTP Basic Authentication when possible as it's more secure
          // This is the recommended approach per OAuth 2.1 best practices
          const response = await fetch(tokenEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Authorization": authHeader,
            },
            body: params.toString(),
          });

          if (response.ok) {
            const tokens = await response.json();
            await this.saveTokens(tokens);
            console.log(
              "Successfully obtained access token using Client Credentials flow",
            );
            return;
          } else {
            const errorText = await response.text();
            console.log(
              `Client Credentials flow failed: ${response.status} ${response.statusText} - ${errorText}`,
            );

            // If the error is unsupported_grant_type, try with Device Code flow first, then Authorization Code flow
            if (errorText.includes("unsupported_grant_type")) {
              console.log(
                "\n-------------------------------------------------------",
              );
              console.log(
                "Client Credentials flow not supported by this server.",
              );
              console.log("This is expected for many cloud services.");
              console.log(
                "Falling back to alternative authentication methods...",
              );
              console.log(
                "-------------------------------------------------------\n",
              );

              // Generate PKCE code verifier and challenge
              const codeVerifier = generateRandomString(128);
              const codeChallenge = await generateCodeChallenge(codeVerifier);
              const state = generateRandomString(32);

              // Store code verifier for later exchange
              await this.saveCodeVerifier(codeVerifier);

              // Use a local callback server for all MCP servers for better compatibility

              // Use the existing callback port if already set, otherwise find an available port
              if (!this.oauthCallbackPort) {
                // Find an available port starting from 3001
                this.oauthCallbackPort = await findAvailablePort(3001);
                console.log(`Found available port: ${this.oauthCallbackPort}`);
              }

              // Set the redirect URI using the callback port
              this.oauthRedirectUri =
                `http://localhost:${this.oauthCallbackPort}/oauth/callback`;
              const redirectUri = this.oauthRedirectUri;
              console.log(`Using local callback URI: ${redirectUri}`);

              // Try to derive authorization endpoint from token endpoint if not already discovered
              if (!this.authorizationEndpoint && this.tokenEndpoint) {
                this.authorizationEndpoint = this.tokenEndpoint.replace(
                  /\/token$/,
                  "/authorize",
                );
                console.log(
                  `Using derived authorization endpoint: ${this.authorizationEndpoint}`,
                );
              } else if (!this.authorizationEndpoint) {
                throw new Error("Could not determine authorization endpoint");
              }

              // Construct authorization URL
              const authUrl = new URL(this.authorizationEndpoint);
              authUrl.searchParams.append("client_id", clientInfo.client_id);
              authUrl.searchParams.append("response_type", "code");
              authUrl.searchParams.append("redirect_uri", redirectUri);
              authUrl.searchParams.append(
                "scope",
                this.config.scope || "tools",
              );
              authUrl.searchParams.append("state", state);
              authUrl.searchParams.append("code_challenge", codeChallenge);
              authUrl.searchParams.append("code_challenge_method", "S256");

              console.log("\n==== AUTHORIZATION REQUIRED ====\n");
              console.log("Opening authorization URL in your browser...");

              // Open the URL in the default browser
              try {
                // Get the appropriate command based on the OS
                let cmd: string[];

                switch (Deno.build.os) {
                  case "darwin":
                    cmd = ["open", authUrl.toString()];
                    break;
                  case "linux":
                    cmd = ["xdg-open", authUrl.toString()];
                    break;
                  case "windows":
                    cmd = ["cmd", "/c", "start", "", authUrl.toString()];
                    break;
                  default:
                    throw new Error(`Unsupported OS: ${Deno.build.os}`);
                }

                // Use Deno.Command instead of deprecated Deno.run
                const command = new Deno.Command(cmd[0], {
                  args: cmd.slice(1),
                  stdout: "null",
                  stderr: "null",
                });

                // Execute the command
                const process = command.spawn();
                await process.status;

                console.log("Browser opened with authorization URL.");
                console.log(
                  "After authorization, you will be redirected to the callback URL automatically.\n",
                );
              } catch (_openError) {
                // If opening the browser fails, fall back to displaying the URL
                console.log(
                  "Failed to open browser automatically. Please open this URL manually:",
                );
                console.log(authUrl.toString());
                console.log(
                  "\nAfter authorization, you will be redirected to the callback URL automatically.\n",
                );
              }

              // Start the callback server to receive the authorization code
              const authorizationCode = await this.promptForAuthorizationCode();
              if (!authorizationCode) {
                throw new Error(
                  "Failed to receive authorization code from callback server",
                );
              }

              console.log(
                `Received authorization code from callback: ${
                  authorizationCode.substring(0, 5)
                }...`,
              );

              // Exchange the authorization code for tokens
              const tokenParams = new URLSearchParams();
              tokenParams.append("grant_type", "authorization_code");
              tokenParams.append("code", authorizationCode);
              tokenParams.append("redirect_uri", redirectUri);
              tokenParams.append("client_id", clientInfo.client_id);
              tokenParams.append("code_verifier", codeVerifier);

              // Create headers for the token request
              const headers: Record<string, string> = {
                "Content-Type": "application/x-www-form-urlencoded",
              };

              // Add Basic auth header if client_secret is available
              if (clientInfo.client_secret) {
                headers["Authorization"] = createBasicAuthHeader(
                  clientInfo.client_id,
                  clientInfo.client_secret,
                );
                console.log("Adding Basic auth header for token request");
              }

              try {
                const tokenResponse = await fetch(this.tokenEndpoint || "", {
                  method: "POST",
                  headers,
                  body: tokenParams.toString(),
                });

                if (tokenResponse.ok) {
                  const tokens = await tokenResponse.json();
                  await this.saveTokens(tokens);
                  console.log(
                    "Successfully obtained access token using Authorization Code flow",
                  );
                  return;
                } else {
                  const tokenError = await tokenResponse.text();
                  throw new Error(
                    `Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText} - ${tokenError}`,
                  );
                }
              } catch (error) {
                console.error("Failed to obtain tokens:", error);
                throw error;
              }
            }
          }
        } catch (error) {
          console.error("Failed to obtain tokens:", error);
          throw error;
        }
      } else {
        console.error("No client credentials available for OAuth flow");
        throw new Error("No client credentials available");
      }
    } else {
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
  }
}
