import { readFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileExists } from '../utils';

export const execAsync = promisify(exec);

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
 * @returns {Promise<any | null>} The parsed package.json or null if not found/invalid
 */
export async function readPackageJson(): Promise<any | null> {
  try {
    const content = await readFile('package.json', 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
