/**
 * Options for creating an OAuth client provider
 */
export interface OAuthProviderOptions {
  /** Port for the OAuth callback server */
  callbackPort: number;
  /** Desired hostname for the OAuth callback server */
  host: string;
  /** Path for the OAuth callback endpoint */
  callbackPath?: string;
  /** Directory to store OAuth credentials */
  configDir?: string;
  /** Client name to use for OAuth registration */
  clientName?: string;
  /** Client URI to use for OAuth registration */
  clientUri?: string;
  /** Software ID to use for OAuth registration */
  softwareId?: string;
  /** Server URL to connect to */
  serverUrl?: string;
  /** Software version to use for OAuth registration */
  softwareVersion?: string;
  /**
   * Optional callback that will be invoked with the authorization URL when the
   * OAuth flow needs the user to complete authentication in the browser. This
   * allows higher-level layers (e.g. the API server) to expose the URL to a
   * web client instead of trying to open the user's browser from the backend
   * process.
   */
  onRedirect?: (url: string) => void | Promise<void>;
}

/**
 * OAuth callback server setup options
 */
export interface OAuthCallbackServerOptions {
  /** Port for the callback server */
  port: number;
  /** Path for the callback endpoint */
  path: string;
}
