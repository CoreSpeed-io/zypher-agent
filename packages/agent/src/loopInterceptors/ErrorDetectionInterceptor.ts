import type { ErrorDetector } from "./errorDetection/mod.ts";
import { AbortError } from "../error.ts";
import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";

/**
 * Loop interceptor that manages error detection with customizable error detectors.
 * Allows registration of custom error detectors for different languages and tools.
 */
export class ErrorDetectionInterceptor implements LoopInterceptor {
  readonly name = "error-detection";
  readonly description =
    "Detects code errors using configurable error detectors";

  #errorDetectors: ErrorDetector[] = [];
  #enabled: boolean = true;

  constructor(enabled: boolean = true) {
    this.#enabled = enabled;
  }

  /**
   * Register a custom error detector
   * @param detector The error detector to register
   */
  registerDetector(detector: ErrorDetector): void {
    // Check for name conflicts
    if (this.#errorDetectors.some((d) => d.name === detector.name)) {
      throw new Error(
        `Error detector with name '${detector.name}' is already registered`,
      );
    }

    this.#errorDetectors.push(detector);
  }

  /**
   * Unregister an error detector by name
   * @param name The name of the detector to remove
   * @returns boolean True if detector was found and removed
   */
  unregisterDetector(name: string): boolean {
    const index = this.#errorDetectors.findIndex((d) => d.name === name);
    if (index >= 0) {
      this.#errorDetectors.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get list of registered detector names
   */
  get registeredDetectors(): string[] {
    return this.#errorDetectors.map((d) => d.name);
  }

  /**
   * Clear all registered detectors
   */
  clearDetectors(): void {
    this.#errorDetectors = [];
  }

  async intercept(context: InterceptorContext): Promise<InterceptorResult> {
    // Check if this interceptor should run
    if (!this.#enabled || this.#errorDetectors.length === 0) {
      return { decision: LoopDecision.COMPLETE };
    }

    const errors = await this.detectErrors(
      context.zypherContext.workingDirectory,
      { signal: context.signal },
    );

    if (errors) {
      // Add error message to context
      context.messages.push({
        role: "user",
        content: [{
          type: "text",
          text: `🔍 Detected code errors that need to be fixed:\n\n${errors}`,
        }],
        timestamp: new Date(),
      });

      return {
        decision: LoopDecision.CONTINUE,
        reasoning: "Found code errors that need to be addressed",
      };
    }

    return {
      decision: LoopDecision.COMPLETE,
      reasoning: "No code errors detected",
    };
  }

  /**
   * Run error detection using registered detectors
   * @param workingDirectory The directory to run detection in
   * @param options Options including abort signal
   * @returns Promise<string | null> Combined error messages if errors found, null otherwise
   */
  private async detectErrors(
    workingDirectory: string,
    options: { signal?: AbortSignal },
  ): Promise<string | null> {
    const applicableDetectors = [];

    // Find applicable detectors
    for (const detector of this.#errorDetectors) {
      if (options.signal?.aborted) {
        throw new AbortError("Aborted while checking detectors");
      }

      try {
        if (await detector.isApplicable(workingDirectory)) {
          applicableDetectors.push(detector);
        }
      } catch (error) {
        console.warn(
          `Error checking if detector ${detector.name} is applicable:`,
          error,
        );
      }
    }

    if (applicableDetectors.length === 0) {
      return null;
    }

    // Run applicable detectors
    const errorMessages = [];

    for (const detector of applicableDetectors) {
      if (options.signal?.aborted) {
        throw new AbortError("Aborted while running detectors");
      }

      try {
        const result = await detector.detect(workingDirectory);
        if (result) {
          errorMessages.push(result);
        }
      } catch (error) {
        console.warn(`Error running detector ${detector.name}:`, error);
      }
    }

    if (errorMessages.length === 0) {
      return null;
    }

    return errorMessages.join("\n\n");
  }

  /**
   * Enable or disable error detection
   */
  set enabled(value: boolean) {
    this.#enabled = value;
  }

  /**
   * Check if error detection is enabled
   */
  get enabled(): boolean {
    return this.#enabled;
  }
}
