import { readFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileExists } from '../utils';

export const execAsync = promisify(exec);

/**
 * Type definition for package.json structure
 */
export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Detects the preferred package manager for a Node.js project.
 *
 * @returns {Promise<'npm' | 'yarn' | 'pnpm'>} The detected package manager
 */
export async function detectPackageManager(): Promise<'npm' | 'yarn' | 'pnpm'> {
  // Check for lockfiles to determine package manager
  if (await fileExists('pnpm-lock.yaml')) {
    return 'pnpm';
  }

  if (await fileExists('yarn.lock')) {
    return 'yarn';
  }

  // Default to npm
  return 'npm';
}

/**
 * Gets the run command for the detected package manager.
 *
 * @param {string} script - The script name to run
 * @returns {Promise<string>} The command to execute the script
 */
export async function getRunCommand(script: string): Promise<string> {
  const packageManager = await detectPackageManager();

  switch (packageManager) {
    case 'yarn':
      return `yarn ${script}`;
    case 'pnpm':
      return `pnpm ${script}`;
    default:
      return `npm run ${script}`;
  }
}

/**
 * Reads and parses the package.json file.
 *
 * @returns {Promise<PackageJson | null>} The parsed package.json or null if not found/invalid
 */
export async function readPackageJson(): Promise<PackageJson | null> {
  try {
    const content = await readFile('package.json', 'utf-8');
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Safely checks if a dependency exists in package.json
 *
 * @param {PackageJson | null} packageJson - The package.json object
 * @param {string} dependency - The dependency name to check
 * @returns {boolean} True if the dependency exists in dependencies or devDependencies
 */
export function hasDependency(packageJson: PackageJson | null, dependency: string): boolean {
  if (!packageJson) return false;

  return !!(
    (packageJson.dependencies && dependency in packageJson.dependencies) ||
    (packageJson.devDependencies && dependency in packageJson.devDependencies)
  );
}

/**
 * Safely checks if a script exists in package.json
 *
 * @param {PackageJson | null} packageJson - The package.json object
 * @param {string} scriptName - The exact script name to check
 * @returns {boolean} True if the script exists
 */
export function hasScript(packageJson: PackageJson | null, scriptName: string): boolean {
  if (!packageJson || !packageJson.scripts) return false;

  return scriptName in packageJson.scripts;
}

/**
 * Safely checks if any script matching a pattern exists in package.json
 *
 * @param {PackageJson | null} packageJson - The package.json object
 * @param {string} pattern - The pattern to match in script names
 * @returns {string | undefined} The name of the first matching script, or undefined if none found
 */
export function findScriptByPattern(
  packageJson: PackageJson | null,
  pattern: string,
): string | undefined {
  if (!packageJson || !packageJson.scripts) return undefined;

  return Object.keys(packageJson.scripts).find((script) => script.includes(pattern));
}

/**
 * Safely gets a script from package.json
 *
 * @param {PackageJson | null} packageJson - The package.json object
 * @param {string} scriptName - The script name to get
 * @returns {string | undefined} The script content or undefined if not found
 */
export function getScript(packageJson: PackageJson | null, scriptName: string): string | undefined {
  if (!packageJson || !packageJson.scripts) return undefined;

  return packageJson.scripts[scriptName];
}

/**
 * Safely extracts error output from an error object
 *
 * @param {unknown} error - The error object
 * @param {(output: string) => string} filterFn - Function to filter the output
 * @returns {string} The filtered error output
 */
export function extractErrorOutput(error: unknown, filterFn: (output: string) => string): string {
  let errorOutput = '';

  if (error && typeof error === 'object') {
    // Extract stdout if available
    if ('stdout' in error) {
      const stdout = String(error.stdout || '');
      const filteredStdout = filterFn(stdout);
      if (filteredStdout) errorOutput += filteredStdout;
    }

    // Extract stderr if available
    if ('stderr' in error) {
      const stderr = String(error.stderr || '');
      const filteredStderr = filterFn(stderr);
      if (filteredStderr) {
        errorOutput += (errorOutput ? '\n' : '') + filteredStderr;
      }
    }

    // Extract message if available and no other output found
    if (!errorOutput && 'message' in error) {
      const message = String(error.message || '');
      const filteredMessage = filterFn(message);
      if (filteredMessage) errorOutput = filteredMessage;
    }
  }

  return errorOutput;
}
