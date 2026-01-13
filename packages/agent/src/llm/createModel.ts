import type { ModelProvider, ModelProviderOptions } from "./ModelProvider.ts";
import {
  AnthropicModelProvider,
  type AnthropicModelProviderOptions,
} from "./Anthropic.ts";
import {
  OpenAIModelProvider,
  type OpenAIModelProviderOptions,
} from "./OpenAI.ts";

/**
 * Options for creating a model provider via `createModel()`.
 */
export interface CreateModelOptions extends ModelProviderOptions {
  /** Anthropic-specific: enable prompt caching (default: true) */
  enablePromptCaching?: boolean;
  /** Anthropic-specific: thinking budget in tokens */
  thinkingBudget?: number;
  /** OpenAI-specific: reasoning effort level for reasoning models */
  reasoningEffort?: "low" | "medium" | "high";
}

/**
 * Create a ModelProvider from a string specification.
 *
 * @example
 * ```typescript
 * // Using string format "provider/model"
 * const model = createModel("anthropic/claude-sonnet-4-20250514");
 * const model = createModel("openai/gpt-4o");
 *
 * // With options
 * const model = createModel("anthropic/claude-sonnet-4-20250514", {
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   enablePromptCaching: true,
 * });
 * ```
 *
 * @param modelString - Model specification in "provider/model-id" format
 * @param options - Optional configuration for the provider
 * @returns A configured ModelProvider instance
 */
export function createModel(
  modelString: string,
  options: CreateModelOptions = {},
): ModelProvider {
  const slashIndex = modelString.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model string "${modelString}". Expected format: "provider/model-id" (e.g., "anthropic/claude-sonnet-4-20250514")`,
    );
  }

  const provider = modelString.slice(0, slashIndex);
  const modelId = modelString.slice(slashIndex + 1);

  if (!modelId) {
    throw new Error(
      `Invalid model string "${modelString}". Model ID cannot be empty.`,
    );
  }

  switch (provider.toLowerCase()) {
    case "anthropic":
      return new AnthropicModelProvider({
        model: modelId,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        enablePromptCaching: options.enablePromptCaching,
        thinkingBudget: options.thinkingBudget,
      });

    case "openai":
      return new OpenAIModelProvider({
        model: modelId,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        reasoningEffort: options.reasoningEffort,
      });

    default:
      throw new Error(
        `Unsupported provider "${provider}". Supported providers: anthropic, openai`,
      );
  }
}

/**
 * Create an Anthropic ModelProvider.
 *
 * @example
 * ```typescript
 * const model = anthropic("claude-sonnet-4-20250514");
 * const model = anthropic("claude-sonnet-4-20250514", { apiKey: "..." });
 * ```
 */
export function anthropic(
  modelId: string,
  options?: Omit<AnthropicModelProviderOptions, "model">,
): ModelProvider {
  return new AnthropicModelProvider({ model: modelId, ...options });
}

/**
 * Create an OpenAI ModelProvider.
 *
 * @example
 * ```typescript
 * const model = openai("gpt-4o");
 * const model = openai("o1", { reasoningEffort: "high" });
 * ```
 */
export function openai(
  modelId: string,
  options?: Omit<OpenAIModelProviderOptions, "model">,
): ModelProvider {
  return new OpenAIModelProvider({ model: modelId, ...options });
}
