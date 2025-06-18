/**
 * LLM Provider Factory and exports
 */

export * from "./LLMProvider.ts";
export * from "./Anthropic.ts";
export * from "./OpenAI.ts";
export * from "./types.ts";

import type { LLMProvider } from "./LLMProvider.ts";
import { AnthropicProvider } from "./Anthropic.ts";
import { OpenAIProvider } from "./OpenAI.ts";

export type ProviderType = 'anthropic' | 'openai';

export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

/**
 * Create an LLM provider based on configuration
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  const { type, apiKey, baseUrl, ...restOptions } = config;
  
  switch (type) {
    case 'anthropic':
      return new AnthropicProvider({
        apiKey,
        ...(baseUrl && { baseURL: baseUrl }),
        ...restOptions
      });
      
    case 'openai':
      return new OpenAIProvider({
        apiKey,
        ...(baseUrl && { baseURL: baseUrl }),
        ...restOptions
      });
      
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Get the default model for a provider type
 */
export function getDefaultModel(providerType: ProviderType): string {
  switch (providerType) {
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'openai':
      return 'gpt-4-turbo-preview';
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}
