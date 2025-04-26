import type { ErrorDetector } from "./interface.ts";
import {
  ESLintErrorDetector,
  TypeScriptErrorDetector,
} from "./javascript/ErrorDetector.ts";
import {
  PythonFlake8ErrorDetector,
  PythonMypyErrorDetector,
} from "./python.ts";
import { GoLintErrorDetector, GoVetErrorDetector } from "./go.ts";
import { AbortError } from "../utils/error.ts";

// Export all interfaces and types
export * from "./interface.ts";

// Export all detectors
export {
  ESLintErrorDetector,
  GoLintErrorDetector,
  GoVetErrorDetector,
  PythonFlake8ErrorDetector,
  PythonMypyErrorDetector,
  TypeScriptErrorDetector,
};

/**
 * Registry of all available error detectors
 */
const errorDetectors: ErrorDetector[] = [
  new ESLintErrorDetector(),
  new TypeScriptErrorDetector(),
  new PythonFlake8ErrorDetector(),
  new PythonMypyErrorDetector(),
  new GoLintErrorDetector(),
  new GoVetErrorDetector(),
];

/**
 * Detects errors in the current workspace using all applicable detectors.
 *
 * @returns {Promise<string | null>} Combined error messages if errors are found, null otherwise
 */
export async function detectErrors(
  options: { signal?: AbortSignal },
): Promise<string | null> {
  try {
    const applicableDetectors = [];

    // Find applicable detectors
    for (const detector of errorDetectors) {
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
