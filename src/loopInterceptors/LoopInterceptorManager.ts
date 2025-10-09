import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";
import { AbortError, formatError } from "../error.ts";
import type { ZypherContext } from "../ZypherAgent.ts";
import type { Logger } from "@logtape/logtape";

/**
 * Manages and executes loop interceptors
 */
export class LoopInterceptorManager {
  readonly #logger: Logger;
  #interceptors: LoopInterceptor[];

  /**
   * Creates a new LoopInterceptorManager
   * @param context The Zypher context
   * @param initialInterceptors Optional array of interceptors to register immediately
   */
  constructor(context: ZypherContext, initialInterceptors: LoopInterceptor[]) {
    this.#logger = context.logger.getChild("interceptors");
    this.#interceptors = [...initialInterceptors];
  }

  /**
   * Register a new loop interceptor
   * @param interceptor The interceptor to register
   */
  register(interceptor: LoopInterceptor): void {
    // Check for name conflicts
    if (this.#interceptors.some((i) => i.name === interceptor.name)) {
      throw new Error(
        `Loop interceptor with name '${interceptor.name}' is already registered`,
      );
    }

    this.#interceptors.push(interceptor);
    this.#logger.info("Registered loop interceptor {interceptorName}", {
      interceptorName: interceptor.name,
    });
  }

  /**
   * Unregister an interceptor by name
   * @param name The name of the interceptor to remove
   * @throws Error if interceptor is not found
   */
  unregister(name: string): void {
    const index = this.#interceptors.findIndex((i) => i.name === name);
    if (index < 0) {
      throw new Error(`Loop interceptor with name '${name}' not found`);
    }

    this.#interceptors.splice(index, 1);
    this.#logger.info("Unregistered loop interceptor {interceptorName}", {
      interceptorName: name,
    });
  }

  /**
   * Get list of registered interceptor names
   * @returns string[] Array of interceptor names
   */
  getRegisteredNames(): string[] {
    return this.#interceptors.map((i) => i.name);
  }

  /**
   * Execute interceptors in chain of responsibility pattern
   * @param context The context to pass to interceptors
   * @returns Promise<InterceptorResult> Result from the chain
   */
  async execute(
    context: Omit<InterceptorContext, "logger">,
  ): Promise<InterceptorResult> {
    // Execute interceptors sequentially until one decides to CONTINUE
    for (const interceptor of this.#interceptors) {
      // Check for abort signal
      if (context.signal?.aborted) {
        throw new AbortError("Aborted while running loop interceptors");
      }

      const ctx = this.#logger.with({
        interceptorName: interceptor.name,
      });

      try {
        ctx.debug("Loop interceptor {interceptorName} executing");

        // Execute the interceptor
        const result = await interceptor.intercept({
          ...context,
          logger: this.#logger.getChild(interceptor.name),
        });

        ctx.info(
          "Loop interceptor {interceptorName} executed, decision: {decision}",
          {
            decision: result.decision,
            reasoning: result.reasoning,
          },
        );

        // If this interceptor wants to continue, it takes control of the chain
        if (result.decision === LoopDecision.CONTINUE) {
          return result;
        }

        // If interceptor decides to COMPLETE, continue to next interceptor
        // (unless it's the last one)
      } catch (error) {
        ctx.error(
          "Error running loop interceptor {interceptorName}: {errorMessage}",
          {
            errorMessage: formatError(error),
            error,
          },
        );
        // Continue with next interceptor even if one fails
      }
    }

    // No interceptor wanted to continue the loop
    return {
      decision: LoopDecision.COMPLETE,
    };
  }

  /**
   * Clear all registered interceptors
   */
  clear(): void {
    this.#interceptors = [];
  }

  /**
   * Get count of registered interceptors
   * @returns number Count of registered interceptors
   */
  count(): number {
    return this.#interceptors.length;
  }
}
