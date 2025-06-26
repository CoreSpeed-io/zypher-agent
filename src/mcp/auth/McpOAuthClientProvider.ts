import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  type OAuthClientInformationFull,
  OAuthClientInformationFullSchema,
  type OAuthTokens,
  OAuthTokensSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthProviderOptions } from "../types/auth.ts";
import {
  deleteConfigFile,
  readJsonFile,
  readTextFile,
  writeJsonFile,
  writeTextFile,
} from "./config.ts";
import { getServerUrlHash } from "./config.ts";
import { log } from "node:console";

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
  constructor(readonly options: OAuthProviderOptions) {
    // Initialize serverUrlHash asynchronously since getServerUrlHash returns a Promise
    this.#serverUrlHash = ""; // Will be set in initialize()
    this.#callbackPath = options.callbackPath || "/oauth/callback";
    this.#clientName = options.clientName || "MCP CLI Client";
    this.#clientUri = options.clientUri ||
      "https://github.com/modelcontextprotocol/mcp-cli";
    this.#softwareId = options.softwareId ||
      "9466000b-baa3-4d20-bd33-46cd9a3411ce";
    this.#softwareVersion = options.softwareVersion || "0.1.0";
  }

  async initialize() {
    this.#serverUrlHash = await getServerUrlHash(this.options.serverUrl);
  }

  get redirectUrl(): string {
    return `http://${this.options.host}:${this.options.callbackPort}${this.#callbackPath}`;
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
    await log(authorizationUrl.toString());
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
  }
}
