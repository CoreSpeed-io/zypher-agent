import type { ModelProvider } from "./model_provider.ts";
import { AnthropicModelProvider } from "./anthropic.ts";
import { OpenAIModelProvider } from "./openai.ts";

/**
 * Configuration options for Cloudflare AI Gateway.
 */
export interface CloudflareGatewayOptions {
  /**
   * The base URL of your Cloudflare AI Gateway.
   * Format: `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}`
   *
   * Find this in your Cloudflare dashboard under AI > AI Gateway.
   */
  gatewayBaseUrl: string;

  /**
   * Your Cloudflare API token with AI Gateway permissions.
   * Create one at: https://dash.cloudflare.com/profile/api-tokens
   */
  apiToken: string;

  /**
   * Optional custom headers to include in all requests.
   * Useful for bypassing bot protection (e.g., User-Agent).
   */
  headers?: Record<string, string>;
}

type Endpoint = "anthropic" | "openai" | "compat";

interface ModelRouting {
  endpoint: Endpoint;
  modelName: string;
}

/**
 * Determines the CF AIG endpoint and model name for a given model.
 * All models must use the format "provider/model" (e.g., "anthropic/claude-sonnet-4").
 * - anthropic/* → endpoint=/anthropic, model name without prefix
 * - openai/* → endpoint=/openai, model name without prefix
 * - other/* → endpoint=/compat, full model string with prefix
 */
function resolveModelRouting(model: string): ModelRouting {
  const slashIndex = model.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model format: "${model}". Expected "provider/model" (e.g., "anthropic/claude-sonnet-4")`,
    );
  }

  const provider = model.slice(0, slashIndex).toLowerCase();
  const modelName = model.slice(slashIndex + 1);

  if (provider === "anthropic") {
    return { endpoint: "anthropic", modelName };
  }

  if (provider === "openai") {
    return { endpoint: "openai", modelName };
  }

  // All other providers → /compat, pass full model string
  return { endpoint: "compat", modelName: model };
}

/**
 * Create a ModelProvider that routes requests through Cloudflare AI Gateway.
 *
 * CF AI Gateway is a proxy that sits between your application and AI providers,
 * enabling:
 * - **Multi-provider access**: Use models from Anthropic, OpenAI, Google, Grok,
 *   DeepSeek, and others through a single gateway
 * - **Unified billing**: Load credits once and pay through a single Cloudflare
 *   bill instead of managing multiple provider accounts
 * - **BYOK (Bring Your Own Key)**: Securely store your provider API keys in
 *   Cloudflare's Secrets Store for easy rotation and centralized management
 * - **Operational features**: Caching, rate limiting, spend limits, analytics,
 *   logging, and fallback/retry capabilities
 *
 * @param model - Model identifier in "provider/model" format
 * @param options - Gateway configuration options
 * @returns A ModelProvider configured to route through CF AI Gateway
 *
 * @example Basic usage with Anthropic
 * ```ts
 * const provider = cloudflareGateway("anthropic/claude-sonnet-4-5", {
 *   gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/{account}/{gateway}",
 *   apiToken: "your-cf-api-token",
 * });
 * ```
 *
 * @example Using OpenAI models
 * ```ts
 * const provider = cloudflareGateway("openai/gpt-4o", {
 *   gatewayBaseUrl: process.env.CF_AIG_BASE_URL,
 *   apiToken: process.env.CF_AIG_API_TOKEN,
 * });
 * ```
 *
 * @example Using other providers via compat endpoint
 * ```ts
 * // Providers like grok, deepseek, google-ai-studio route to /compat
 * const provider = cloudflareGateway("grok/grok-3", { gatewayBaseUrl, apiToken });
 * ```
 *
 * ## Model Routing
 *
 * | Input                        | Endpoint     | Model sent to API     |
 * | ---------------------------- | ------------ | --------------------- |
 * | `anthropic/claude-sonnet-4`  | `/anthropic` | `claude-sonnet-4`     |
 * | `openai/gpt-4o`              | `/openai`    | `gpt-4o`              |
 * | `grok/grok-3`                | `/compat`    | `grok/grok-3`         |
 * | `deepseek/deepseek-chat`     | `/compat`    | `deepseek/deepseek-chat` |
 *
 * @throws Error if model format is invalid (missing provider prefix)
 *
 * @see https://developers.cloudflare.com/ai-gateway/
 */
export function cloudflareGateway(
  model: string,
  options: CloudflareGatewayOptions,
): ModelProvider {
  const { endpoint, modelName } = resolveModelRouting(model);
  const baseUrl = `${options.gatewayBaseUrl}/${endpoint}`;

  if (endpoint === "anthropic") {
    return new AnthropicModelProvider({
      model: modelName,
      apiKey: options.apiToken,
      baseUrl,
      anthropicClientOptions: options.headers
        ? { defaultHeaders: options.headers }
        : undefined,
    });
  }

  return new OpenAIModelProvider({
    model: modelName,
    apiKey: options.apiToken,
    baseUrl,
    openaiClientOptions: options.headers
      ? { defaultHeaders: options.headers }
      : undefined,
  });
}
