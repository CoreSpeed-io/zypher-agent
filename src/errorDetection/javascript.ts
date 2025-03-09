import type { ErrorDetector } from './interface';
import {
  execAsync,
  readPackageJson,
  getRunCommand,
  hasDependency,
  hasScript,
  findScriptByPattern,
  extractErrorOutput,
} from './utils';
import { fileExists } from '../utils';

/**
 * Detector for ESLint errors in JavaScript/TypeScript projects
 */
export class ESLintErrorDetector implements ErrorDetector {
  name = 'ESLint';
  description = 'Detects code style and potential issues using ESLint';

  async isApplicable(): Promise<boolean> {
    try {
      const packageJson = await readPackageJson();

      // Check if eslint is in dependencies or devDependencies
      const hasEslint = hasDependency(packageJson, 'eslint');

      // Also check if there are lint scripts
      const hasLintScript =
        hasScript(packageJson, 'lint') ||
        hasScript(packageJson, 'eslint') ||
        !!findScriptByPattern(packageJson, 'lint');

      return hasEslint || hasLintScript;
    } catch {
      return false;
    }
  }

  async detect(): Promise<string | null> {
    try {
      // Determine the command to run
      const command = await this.determineCommand();

      // Execute the command
      try {
        // If we get here, the command succeeded (no errors)
        await execAsync(command);
        return null;
      } catch (error) {
        // Command failed, which likely means it found errors
        const errorOutput = extractErrorOutput(error, this.filterNonErrors);

        if (errorOutput) {
          return `ESLint errors detected:\n${errorOutput}`;
        }
      }

      return null;
    } catch (error) {
      console.warn('Error running ESLint check:', error);
      return null;
    }
  }

  /**
   * Determines the command to run for ESLint
   *
   * @returns {Promise<string>} The command to execute
   * @private
   */
  private async determineCommand(): Promise<string> {
    const packageJson = await readPackageJson();

    // If package.json has a lint script, use it
    if (packageJson?.scripts) {
      // Find the appropriate script name
      let scriptName: string | undefined;

      if (hasScript(packageJson, 'lint')) {
        scriptName = 'lint';
      } else if (hasScript(packageJson, 'eslint')) {
        scriptName = 'eslint';
      } else {
        scriptName = findScriptByPattern(packageJson, 'lint');
      }

      if (scriptName) {
        return await getRunCommand(scriptName);
      }
    }

    // For direct commands, we'll use the eslint binary directly
    // but still respect the package manager via getRunCommand
    return await getRunCommand('eslint . --ext .js,.jsx,.ts,.tsx');
  }

  /**
   * Filters out npm notices and other non-error output
   *
   * @param {string} output - The command output to filter
   * @returns {string} Filtered output containing only actual errors
   */
  private filterNonErrors(output: string): string {
    // Split by lines
    const lines = output.split('\n');

    // Filter out npm notices and empty lines
    const errorLines = lines.filter((line) => {
      // Skip npm notices
      if (line.trim().startsWith('npm notice')) return false;
      // Skip empty lines
      if (line.trim() === '') return false;
      // Skip npm warnings that aren't related to the code
      if (line.includes('npm WARN')) return false;
      return true;
    });

    return errorLines.join('\n');
  }
}

/**
 * Detector for TypeScript compiler errors
 */
export class TypeScriptErrorDetector implements ErrorDetector {
  name = 'TypeScript';
  description = 'Detects type errors using the TypeScript compiler';

  async isApplicable(): Promise<boolean> {
    try {
      // Check package.json first
      const packageJson = await readPackageJson();
      if (packageJson) {
        // Check if typescript is in dependencies
        const hasTypeScript = hasDependency(packageJson, 'typescript');

        // Check if there are type-check scripts
        const hasTypeCheckScript =
          hasScript(packageJson, 'type-check') ||
          hasScript(packageJson, 'typecheck') ||
          hasScript(packageJson, 'tsc') ||
          !!findScriptByPattern(packageJson, 'type') ||
          !!findScriptByPattern(packageJson, 'tsc');

        if (hasTypeScript || hasTypeCheckScript) {
          return true;
        }
      }

      // Fallback to checking for tsconfig.json
      return await fileExists('tsconfig.json');
    } catch {
      return false;
    }
  }

  async detect(): Promise<string | null> {
    try {
      // Determine the command to run
      const command = await this.determineCommand();

      // Execute the command
      try {
        // If we get here, the command succeeded (no errors)
        await execAsync(command);
        return null;
      } catch (error) {
        // Command failed, which likely means it found errors
        const errorOutput = extractErrorOutput(error, this.filterNonErrors);

        if (errorOutput) {
          return `TypeScript errors detected:\n${errorOutput}`;
        }
      }

      return null;
    } catch (error) {
      console.warn('Error running TypeScript check:', error);
      return null;
    }
  }

  /**
   * Determines the command to run for TypeScript
   *
   * @returns {Promise<string>} The command to execute
   * @private
   */
  private async determineCommand(): Promise<string> {
    const packageJson = await readPackageJson();

    // If package.json has a type-check script, use it
    if (packageJson?.scripts) {
      // Find the appropriate script name
      let scriptName: string | undefined;

      if (hasScript(packageJson, 'type-check')) {
        scriptName = 'type-check';
      } else if (hasScript(packageJson, 'typecheck')) {
        scriptName = 'typecheck';
      } else if (hasScript(packageJson, 'tsc')) {
        scriptName = 'tsc';
      } else {
        scriptName =
          findScriptByPattern(packageJson, 'type') || findScriptByPattern(packageJson, 'tsc');
      }

      if (scriptName) {
        return await getRunCommand(scriptName);
      }
    }

    // For direct commands, we'll use the tsc binary directly
    // but still respect the package manager via getRunCommand
    return await getRunCommand('tsc --noEmit');
  }

  /**
   * Filters out npm notices and other non-error output
   *
   * @param {string} output - The command output to filter
   * @returns {string} Filtered output containing only actual errors
   */
  private filterNonErrors(output: string): string {
    // Split by lines
    const lines = output.split('\n');

    // Filter out npm notices and empty lines
    const errorLines = lines.filter((line) => {
      // Skip npm notices
      if (line.trim().startsWith('npm notice')) return false;
      // Skip empty lines
      if (line.trim() === '') return false;
      // Skip npm warnings that aren't related to the code
      if (line.includes('npm WARN')) return false;
      return true;
    });

    return errorLines.join('\n');
  }
}
