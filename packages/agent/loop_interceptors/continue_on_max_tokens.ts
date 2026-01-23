import type {
  InterceptorContext,
  InterceptorResult,
  LoopInterceptor,
} from "./interface.ts";

/**
 * Creates an interceptor that automatically continues when the LLM response
 * is truncated due to max tokens.
 *
 * @example
 * ```typescript
 * const agent = await createZypherAgent({
 *   model: "claude-sonnet-4-5-20250929",
 *   loopInterceptors: [
 *     new ToolExecutionInterceptor(mcpManager),
 *     continueOnMaxTokens(5),
 *   ],
 * });
 * ```
 *
 * @param maxContinuations Maximum number of continuations before stopping (default: Infinity)
 * @returns A LoopInterceptor that continues on max_tokens stop reason
 */
export function continueOnMaxTokens(
  maxContinuations: number = Infinity,
): LoopInterceptor {
  let continuations = 0;

  return {
    name: "continue-on-max-tokens",
    intercept(ctx: InterceptorContext): InterceptorResult {
      if (ctx.stopReason !== "max_tokens") {
        continuations = 0; // Reset on non-max_tokens
        return { complete: true };
      }

      if (continuations >= maxContinuations) {
        return { complete: true };
      }

      continuations++;

      return { complete: false, reason: "Continue" };
    },
  };
}
