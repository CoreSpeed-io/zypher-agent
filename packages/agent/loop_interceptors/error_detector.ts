import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";

/**
 * Creates an interceptor that runs a command and continues the loop if it fails.
 *
 * This is useful for running linters, type checkers, or test commands
 * and having the agent fix any errors.
 *
 * @example
 * ```typescript
 * const agent = await createZypherAgent({
 *   model: "claude-sonnet-4-5-20250929",
 *   loopInterceptors: [
 *     new ToolExecutionInterceptor(mcpManager),
 *     errorDetector("deno", ["check", "."]),
 *     errorDetector("deno", ["lint"]),
 *   ],
 * });
 * ```
 *
 * @param command The command to run
 * @param args Arguments to pass to the command
 * @returns A LoopInterceptor that runs the command and injects errors as feedback
 */
export function errorDetector(
  command: string,
  args: string[] = [],
): LoopInterceptor {
  const displayName = [command, ...args].join(" ");
  const decoder = new TextDecoder();

  return {
    name: `error-detector:${displayName}`,
    description: `Run "${displayName}" and continue on errors`,
    async intercept(ctx: InterceptorContext): Promise<InterceptorResult> {
      const result = await new Deno.Command(command, {
        args,
        cwd: ctx.zypherContext.workingDirectory,
        signal: ctx.signal,
      }).output();

      if (result.success) {
        return { decision: LoopDecision.COMPLETE };
      }

      const errors = decoder.decode(result.stderr) ||
        decoder.decode(result.stdout);

      const reason =
        `Command "${displayName}" failed:\n\n${errors}\n\nPlease fix these errors.`;

      ctx.messages.push({
        role: "user",
        content: [{ type: "text", text: reason }],
        timestamp: new Date(),
      });

      return { decision: LoopDecision.CONTINUE, reasoning: reason };
    },
  };
}
