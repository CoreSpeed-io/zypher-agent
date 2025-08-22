// Export all interfaces and types
export * from "./interface.ts";

// Export JavaScript error detectors
export {
  ESLintErrorDetector,
  TypeScriptErrorDetector,
} from "./javascript/ErrorDetector.ts";

// Export utility functions
export { extractErrorOutput } from "./utils.ts";
