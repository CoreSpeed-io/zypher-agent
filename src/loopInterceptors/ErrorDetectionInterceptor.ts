import type { ErrorDetector } from "./errorDetection/mod.ts";
import {
  ESLintErrorDetector,
  TypeScriptErrorDetector,
} from "./errorDetection/mod.ts";
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

  private errorDetectors: ErrorDetector[] = [];
  private enabled: boolean = true;

  constructor(options: {
    enabled?: boolean;
    useDefaultJavaScriptDetectors?: boolean;
  } = {}) {
    this.enabled = options.enabled ?? true;

    // Add default JavaScript detectors unless explicitly disabled
    if (options.useDefaultJavaScriptDetectors !== false) {
      this.registerDetector(new ESLintErrorDetector());
      this.registerDetector(new TypeScriptErrorDetector());
    }
  }

  /**
   * Register a custom error detector
   * @param detector The error detector to register
   */
  registerDetector(detector: ErrorDetector): void {
    // Check for name conflicts
    if (this.errorDetectors.some((d) => d.name === detector.name)) {
      throw new Error(
        `Error detector with name '${detector.name}' is already registered`,
      );
    }

    this.errorDetectors.push(detector);
  }

  /**
   * Unregister an error detector by name
   * @param name The name of the detector to remove
   * @returns boolean True if detector was found and removed
   */
  unregisterDetector(name: string): boolean {
    const index = this.errorDetectors.findIndex((d) => d.name === name);
    if (index >= 0) {
      this.errorDetectors.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get list of registered detector names
   * @returns string[] Array of detector names
   */
  getRegisteredDetectors(): string[] {
    return this.errorDetectors.map((d) => d.name);
  }

  /**
   * Clear all registered detectors
   */
  clearDetectors(): void {
    this.errorDetectors = [];
  }

  async isApplicable(_context: InterceptorContext): Promise<boolean> {
    return this.enabled && this.errorDetectors.length > 0;
  }

  async intercept(context: InterceptorContext): Promise<InterceptorResult> {
    try {
      const errors = await this.detectErrors({ signal: context.signal });

      if (errors) {
        return {
          decision: LoopDecision.CONTINUE,
          contextInjections: [{
            message:
              `🔍 Detected code errors that need to be fixed:\n\n${errors}`,
            priority: "high",
            source: this.name,
          }],
          reasoning: "Found code errors that need to be addressed",
        };
      }

      return {
        decision: LoopDecision.COMPLETE,
        reasoning: "No code errors detected",
      };
    } catch (error) {
      console.warn("Error detection interceptor failed:", error);
      return {
        decision: LoopDecision.COMPLETE,
        reasoning: "Error detection failed, allowing completion",
      };
    }
  }

  /**
   * Run error detection using registered detectors
   * @param options Options including abort signal
   * @returns Promise<string | null> Combined error messages if errors found, null otherwise
   */
  private async detectErrors(
    options: { signal?: AbortSignal },
  ): Promise<string | null> {
    try {
      const applicableDetectors = [];

      // Find applicable detectors
      for (const detector of this.errorDetectors) {
        if (options.signal?.aborted) {
          throw new AbortError("Aborted while checking detectors");
        }

        try {
          if (await detector.isApplicable()) {
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
          const result = await detector.detect();
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
    } catch (error) {
      console.warn("Failed to run error detection:", error);
      return null;
    }
  }

  /**
   * Enable or disable error detection
   * @param enabled Whether error detection should be enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if error detection is enabled
   * @returns boolean True if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
