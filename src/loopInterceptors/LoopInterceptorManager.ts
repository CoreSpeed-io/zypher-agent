import {
  type ContextInjection,
  type InterceptorContext,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";
import { AbortError, formatError } from "../error.ts";

/**
 * Aggregated result from running multiple loop interceptors
 */
export interface AggregatedInterceptorResult {
  /** Final decision (CONTINUE if any interceptor wants to continue) */
  decision: LoopDecision;
  /** All context injections from interceptors that ran */
  contextInjections: ContextInjection[];
  /** Names of interceptors that executed */
  executedInterceptors: string[];
  /** Combined reasoning from all interceptors */
  reasoning?: string;
}

/**
 * Manages and executes loop interceptors
 */
export class LoopInterceptorManager {
  private interceptors: LoopInterceptor[] = [];

  /**
   * Register a new loop interceptor
   * @param interceptor The interceptor to register
   */
  register(interceptor: LoopInterceptor): void {
    // Check for name conflicts
    if (this.interceptors.some((i) => i.name === interceptor.name)) {
      throw new Error(
        `Loop interceptor with name '${interceptor.name}' is already registered`,
      );
    }

    this.interceptors.push(interceptor);
  }

  /**
   * Unregister an interceptor by name
   * @param name The name of the interceptor to remove
   * @returns boolean True if interceptor was found and removed
   */
  unregister(name: string): boolean {
    const index = this.interceptors.findIndex((i) => i.name === name);
    if (index >= 0) {
      this.interceptors.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get list of registered interceptor names
   * @returns string[] Array of interceptor names
   */
  getRegisteredNames(): string[] {
    return this.interceptors.map((i) => i.name);
  }

  /**
   * Execute all applicable interceptors and aggregate their results
   * @param context The context to pass to interceptors
   * @returns Promise<AggregatedInterceptorResult> Aggregated result
   */
  async execute(
    context: InterceptorContext,
  ): Promise<AggregatedInterceptorResult> {
    const contextInjections: ContextInjection[] = [];
    const executedInterceptors: string[] = [];
    const reasonings: string[] = [];
    let finalDecision: LoopDecision = LoopDecision.COMPLETE;

    for (const interceptor of this.interceptors) {
      // Check for abort signal
      if (context.signal?.aborted) {
        throw new AbortError("Aborted while running loop interceptors");
      }

      try {
        // Check if interceptor is applicable
        const isApplicable = await interceptor.isApplicable(context);
        if (!isApplicable) {
          continue;
        }

        // Execute the interceptor
        const result = await interceptor.intercept(context);
        executedInterceptors.push(interceptor.name);

        // Collect context injections
        if (result.contextInjections) {
          contextInjections.push(...result.contextInjections);
        }

        // Collect reasoning
        if (result.reasoning) {
          reasonings.push(`${interceptor.name}: ${result.reasoning}`);
        }

        // If any interceptor wants to continue, we continue
        if (result.decision === LoopDecision.CONTINUE) {
          finalDecision = LoopDecision.CONTINUE;
        }
      } catch (error) {
        console.warn(
          `Error running loop interceptor '${interceptor.name}':`,
          formatError(error),
        );
        // Continue with other interceptors even if one fails
      }
    }

    // Sort context injections by priority (high -> medium -> low)
    contextInjections.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return {
      decision: finalDecision,
      contextInjections,
      executedInterceptors,
      reasoning: reasonings.length > 0 ? reasonings.join("\n") : undefined,
    };
  }

  /**
   * Clear all registered interceptors
   */
  clear(): void {
    this.interceptors = [];
  }

  /**
   * Get count of registered interceptors
   * @returns number Count of registered interceptors
   */
  count(): number {
    return this.interceptors.length;
  }
}
