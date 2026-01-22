import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
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
    description: "Auto-continue when response is truncated due to max tokens",
    intercept(ctx: InterceptorContext): Promise<InterceptorResult> {
      if (ctx.stopReason !== "max_tokens") {
        continuations = 0; // Reset on non-max_tokens
        return Promise.resolve({ decision: LoopDecision.COMPLETE });
      }

      if (continuations >= maxContinuations) {
        return Promise.resolve({ decision: LoopDecision.COMPLETE });
      }

      continuations++;

      const reason = "Continue";
      ctx.messages.push({
        role: "user",
        content: [{ type: "text", text: reason }],
        timestamp: new Date(),
      });

      return Promise.resolve({
        decision: LoopDecision.CONTINUE,
        reasoning: reason,
      });
    },
  };
}
