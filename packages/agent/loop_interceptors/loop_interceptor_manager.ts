import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";
import { createAbortError } from "@zypher/utils";

/**
 * Manages and executes loop interceptors
 */
export class LoopInterceptorManager {
  #interceptors: LoopInterceptor[];

  /**
   * Creates a new LoopInterceptorManager
   * @param initialInterceptors Optional array of interceptors to register immediately
   */
  constructor(initialInterceptors: LoopInterceptor[] = []) {
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
  }

  /**
   * Unregister an interceptor by name
   * @param name The name of the interceptor to remove
   * @returns boolean True if interceptor was found and removed
   */
  unregister(name: string): boolean {
    const index = this.#interceptors.findIndex((i) => i.name === name);
    if (index >= 0) {
      this.#interceptors.splice(index, 1);
      return true;
    }
    return false;
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
    context: InterceptorContext,
  ): Promise<InterceptorResult> {
    // Execute interceptors sequentially until one decides to CONTINUE
    for (const interceptor of this.#interceptors) {
      // Check for abort signal
      if (context.signal?.aborted) {
        throw createAbortError("Aborted while running loop interceptors");
      }

      context.eventSubject.next({
        type: "interceptor_use",
        interceptorName: interceptor.name,
      });

      try {
        // Execute the interceptor
        const result = await interceptor.intercept(context);

        context.eventSubject.next({
          type: "interceptor_result",
          interceptorName: interceptor.name,
          decision: result.decision === LoopDecision.CONTINUE
            ? "continue"
            : "complete",
        });

        // If this interceptor wants to continue, it takes control of the chain
        if (result.decision === LoopDecision.CONTINUE) {
          return result;
        }

        // If interceptor decides to COMPLETE, continue to next interceptor
        // (unless it's the last one)
      } catch (error) {
        context.eventSubject.next({
          type: "interceptor_error",
          interceptorName: interceptor.name,
          error,
        });
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
