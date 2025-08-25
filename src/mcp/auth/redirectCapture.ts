export interface RedirectCapture {
  onRedirect: (url: string) => void;
  redirectPromise: Promise<void>;
  getAuthUrl: () => string | undefined;
}

// Utility to capture the first OAuth redirect URL emitted during registration
// This is placed in the OAuth layer so higher-level consumers (like the API server)
// can simply import and await the helper without duplicating logic.
export function createRedirectCapture(): RedirectCapture {
  let authUrl: string | undefined;
  let resolveRedirect!: () => void;

  // Promise that resolves when the first redirect URL is emitted
  const redirectPromise = new Promise<void>((resolve) => {
    resolveRedirect = resolve;
  });

  // Callback for OAuth providers to call when they get a redirect URL
  const onRedirect = async (url: string) => {
    if (!authUrl) {
      authUrl = url;
      await resolveRedirect();
    }
  };

  return {
    onRedirect,
    redirectPromise,
    getAuthUrl: () => authUrl,
  } as const;
}
