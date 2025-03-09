import type { ErrorDetector } from './interface';
import { execAsync, extractErrorOutput } from './utils';
import { fileExists } from '../utils';

/**
 * Detector for Go linting errors
 */
export class GoLintErrorDetector implements ErrorDetector {
  name = 'golint';
  description = 'Detects Go code style and quality issues';

  async isApplicable(): Promise<boolean> {
    try {
      // Check if go.mod exists
      return await fileExists('go.mod');
    } catch {
      return false;
    }
  }

  async detect(): Promise<string | null> {
    try {
      // Check if golint is installed
      try {
        await execAsync('which golint');
      } catch {
        try {
          await execAsync('go list -f {{.Target}} golang.org/x/lint/golint');
        } catch {
          return null; // golint not available
        }
      }

      // Run golint
      try {
        const result = await execAsync('golint ./...');
        if (result.stdout) {
          return `Go lint errors detected:\n${result.stdout}`;
        }
        return null;
      } catch (error) {
        const errorOutput = extractErrorOutput(error, (output) => output);

        if (errorOutput) {
          return `Go lint errors detected:\n${errorOutput}`;
        }

        return null;
      }
    } catch {
      return null;
    }
  }
}

/**
 * Detector for Go vet errors
 */
export class GoVetErrorDetector implements ErrorDetector {
  name = 'go vet';
  description = 'Detects suspicious constructs in Go code';

  async isApplicable(): Promise<boolean> {
    try {
      // Check if go.mod exists
      return await fileExists('go.mod');
    } catch {
      return false;
    }
  }

  async detect(): Promise<string | null> {
    try {
      // Run go vet
      try {
        const result = await execAsync('go vet ./...');
        // If stderr is empty, there are no errors
        if (!result.stderr) {
          return null;
        }
        return `Go vet errors detected:\n${result.stderr}`;
      } catch (error) {
        const errorOutput = extractErrorOutput(error, (output) => output);

        if (errorOutput) {
          return `Go vet errors detected:\n${errorOutput}`;
        }

        return null;
      }
    } catch {
      return null;
    }
  }
}
