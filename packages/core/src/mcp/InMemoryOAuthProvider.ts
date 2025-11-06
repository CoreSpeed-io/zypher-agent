import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * In-memory OAuth provider for testing and development
 * This implementation stores OAuth data in memory (not persistent)
 * Suitable for testing, development, or scenarios where persistence is not required
 */
export class InMemoryOAuthProvider implements OAuthClientProvider {
  #clientInformation?: OAuthClientInformationFull = undefined;
  #tokens?: OAuthTokens = undefined;
  #codeVerifier?: string = undefined;

  constructor(
    private readonly config: {
      clientMetadata: OAuthClientMetadata;
      onRedirect?: (authorizationUrl: string) => void | Promise<void>;
    },
  ) {}

  get redirectUrl(): string {
    return this.config.clientMetadata.redirect_uris[0];
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.config.clientMetadata;
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return this.#clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    this.#clientInformation = clientInformation;
  }

  tokens(): OAuthTokens | undefined {
    return this.#tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.#tokens = tokens;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (this.config.onRedirect) {
      await this.config.onRedirect(authorizationUrl.toString());
    }
    // If no onRedirect handler provided, this is a no-op
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.#codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.#codeVerifier) {
      throw new Error("No code verifier saved");
    }
    return this.#codeVerifier;
  }

  /**
   * Clears all stored OAuth data
   */
  clear(): void {
    this.#clientInformation = undefined;
    this.#tokens = undefined;
    this.#codeVerifier = undefined;
  }
}
