import type { ErrorDetector } from "./interface.ts";
import { ESLintErrorDetector, TypeScriptErrorDetector } from "./javascript.ts";
import { PythonFlake8ErrorDetector, PythonMypyErrorDetector } from "./python.ts";
import { GoLintErrorDetector, GoVetErrorDetector } from "./go.ts";

// Export all interfaces and types
export * from "./interface.ts";

// Export all detectors
export {
  ESLintErrorDetector,
  TypeScriptErrorDetector,
  PythonFlake8ErrorDetector,
  PythonMypyErrorDetector,
  GoLintErrorDetector,
  GoVetErrorDetector,
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
export async function detectErrors(): Promise<string | null> {
  try {
    const applicableDetectors = [];

    // Find applicable detectors
    for (const detector of errorDetectors) {
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
