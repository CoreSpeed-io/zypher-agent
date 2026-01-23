import type {
  InterceptorContext,
  InterceptorResult,
  LoopInterceptor,
} from "./interface.ts";
import { createAbortError } from "@zypher/utils";

/**
 * Manages and executes loop interceptors
 */
export class LoopInterceptorManager {
  #interceptors: Map<string, LoopInterceptor> = new Map();

  /**
   * Creates a new LoopInterceptorManager
   * @param initialInterceptors Optional array of interceptors to register immediately
   */
  constructor(initialInterceptors: LoopInterceptor[] = []) {
    for (const interceptor of initialInterceptors) {
      if (this.#interceptors.has(interceptor.name)) {
        throw new Error(
          `Duplicate loop interceptor name: '${interceptor.name}'`,
        );
      }
      this.#interceptors.set(interceptor.name, interceptor);
    }
  }

  /**
   * Register a new loop interceptor
   * @param interceptor The interceptor to register
   */
  register(interceptor: LoopInterceptor): void {
    if (this.#interceptors.has(interceptor.name)) {
      throw new Error(
        `Loop interceptor with name '${interceptor.name}' is already registered`,
      );
    }
    this.#interceptors.set(interceptor.name, interceptor);
  }

  /**
   * Unregister an interceptor by name
   * @param name The name of the interceptor to remove
   * @returns boolean True if interceptor was found and removed
   */
  unregister(name: string): boolean {
    return this.#interceptors.delete(name);
  }

  /**
   * Get list of registered interceptor names
   * @returns string[] Array of interceptor names
   */
  getRegisteredNames(): string[] {
    return Array.from(this.#interceptors.keys());
  }

  /**
   * Execute interceptors in chain of responsibility pattern
   * @param context The context to pass to interceptors
   * @returns Promise<InterceptorResult> Result from the chain
   */
  async execute(
    context: InterceptorContext,
  ): Promise<InterceptorResult> {
    // Execute interceptors sequentially until one decides to continue
    for (const interceptor of this.#interceptors.values()) {
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
          decision: result.complete ? "complete" : "continue",
        });

        // If this interceptor wants to continue, it takes control of the chain
        if (!result.complete) {
          // Auto-inject reason as user message if provided
          if (result.reason) {
            context.messages.push({
              role: "user",
              content: [{ type: "text", text: result.reason }],
              timestamp: new Date(),
            });
          }
          return { complete: false };
        }

        // If interceptor decides to complete, continue to next interceptor
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
    return { complete: true };
  }

  /**
   * Clear all registered interceptors
   */
  clear(): void {
    this.#interceptors.clear();
  }

  /**
   * Get count of registered interceptors
   * @returns number Count of registered interceptors
   */
  count(): number {
    return this.#interceptors.size;
  }
}
