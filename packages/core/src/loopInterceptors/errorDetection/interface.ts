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
   * @param workingDirectory The directory to check in
   * @returns Promise<boolean> True if this detector should be run
   */
  isApplicable(workingDirectory: string): Promise<boolean>;

  /**
   * Run the error detection
   * @param workingDirectory The directory to run detection in
   * @returns Promise<string | null> Error message if errors found, null otherwise
   */
  detect(workingDirectory: string): Promise<string | null>;
}
