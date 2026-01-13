import type { ZypherContext } from "../../ZypherAgent.ts";

/**
 * Interface for error detectors.
 * Each detector is responsible for checking a specific type of error.
 */
export interface ErrorDetector {
  /** Unique name of the detector */
  name: string;

  /** Description of what this detector checks for */
  description: string;

  /**
   * Check if this detector is applicable for the current project
   * @param context The Zypher context containing adapters and working directory
   * @returns Promise<boolean> True if this detector should be run
   */
  isApplicable(context: ZypherContext): Promise<boolean>;

  /**
   * Run the error detection
   * @param context The Zypher context containing adapters and working directory
   * @returns Promise<string | null> Error message if errors found, null otherwise
   */
  detect(context: ZypherContext): Promise<string | null>;
}
