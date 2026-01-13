import type { TokenUsage } from "../llm/ModelProvider.ts";

/**
 * Add an optional number, preserving undefined if both are undefined.
 */
function addOptional(a?: number, b?: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

/**
 * Add two TokenUsage objects together.
 * If both inputs are undefined, returns undefined.
 * If one is undefined, returns the other.
 */
export function addTokenUsage(
  a: TokenUsage | undefined,
  b: TokenUsage,
): TokenUsage;
export function addTokenUsage(
  a: TokenUsage,
  b: TokenUsage | undefined,
): TokenUsage;
export function addTokenUsage(
  a: TokenUsage | undefined,
  b: TokenUsage | undefined,
): TokenUsage | undefined;
export function addTokenUsage(
  a: TokenUsage | undefined,
  b: TokenUsage | undefined,
): TokenUsage | undefined {
  if (a === undefined && b === undefined) return undefined;
  if (a === undefined) return b;
  if (b === undefined) return a;

  return {
    input: {
      total: a.input.total + b.input.total,
      cacheCreation: addOptional(a.input.cacheCreation, b.input.cacheCreation),
      cacheRead: addOptional(a.input.cacheRead, b.input.cacheRead),
    },
    output: {
      total: a.output.total + b.output.total,
      thinking: addOptional(a.output.thinking, b.output.thinking),
    },
    total: a.total + b.total,
  };
}

/**
 * Sum multiple TokenUsage objects into a single aggregate.
 * Returns undefined if all inputs are undefined or the array is empty.
 */
export function sumTokenUsage(
  ...usages: (TokenUsage | undefined)[]
): TokenUsage | undefined {
  return usages.reduce<TokenUsage | undefined>(addTokenUsage, undefined);
}
