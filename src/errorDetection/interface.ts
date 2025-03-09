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
   * @returns Promise<boolean> True if this detector should be run
   */
  isApplicable(): Promise<boolean>;
  
  /**
   * Run the error detection
   * @returns Promise<string | null> Error message if errors found, null otherwise
   */
  detect(): Promise<string | null>;
} 