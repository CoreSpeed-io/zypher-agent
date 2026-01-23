import type { ModelProvider } from "./model_provider.ts";
import { AnthropicModelProvider } from "./anthropic.ts";
import { OpenAIModelProvider } from "./openai.ts";

export interface CloudflareGatewayOptions {
  /** CF AIG base URL (e.g., https://gateway.ai.cloudflare.com/v1/{account}/{gateway}) */
  gatewayUrl: string;
  /** CF AIG API token */
  apiToken: string;
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
 * Create a ModelProvider that routes through Cloudflare AI Gateway.
 */
export function cloudflareGateway(
  model: string,
  options: CloudflareGatewayOptions,
): ModelProvider {
  const { endpoint, modelName } = resolveModelRouting(model);
  const baseUrl = `${options.gatewayUrl}/${endpoint}`;

  if (endpoint === "anthropic") {
    return new AnthropicModelProvider({
      model: modelName,
      apiKey: options.apiToken,
      baseUrl,
    });
  }

  return new OpenAIModelProvider({
    model: modelName,
    apiKey: options.apiToken,
    baseUrl,
  });
}
