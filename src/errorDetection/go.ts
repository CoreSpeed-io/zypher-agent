import type { ErrorDetector } from './interface';
import { execAsync } from './utils';
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
        const { stdout } = await execAsync('golint ./...');
        if (stdout) {
          return `Go lint errors detected:\n${stdout}`;
        }
        return null;
      } catch (error: any) {
        if (error.stdout) {
          return `Go lint errors detected:\n${error.stdout}`;
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
        const { stdout, stderr } = await execAsync('go vet ./...');
        if (stderr) {
          return `Go vet errors detected:\n${stderr}`;
        }
        return null;
      } catch (error: any) {
        if (error.stderr) {
          return `Go vet errors detected:\n${error.stderr}`;
        }
        if (error.stdout) {
          return `Go vet errors detected:\n${error.stdout}`;
        }
        return null;
      }
    } catch {
      return null;
    }
  }
} 