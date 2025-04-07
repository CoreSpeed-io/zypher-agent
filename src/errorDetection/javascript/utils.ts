import { fileExists } from "../../utils/index.ts";

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
 * Command configuration type for Deno.Command
 */
export interface CommandConfig {
  cmd: string;
  args?: string[];
}

/**
 * Detects the preferred package manager for a Node.js project.
 *
 * @returns {Promise<'npm' | 'yarn' | 'pnpm' | 'bun'>} The detected package manager
 */
export async function detectPackageManager(): Promise<
  "npm" | "yarn" | "pnpm" | "bun"
> {
  // Check for lockfiles to determine package manager
  if ((await fileExists("bun.lock")) || (await fileExists("bun.lockb"))) {
    return "bun";
  }

  if (await fileExists("pnpm-lock.yaml")) {
    return "pnpm";
  }

  if (await fileExists("yarn.lock")) {
    return "yarn";
  }

  // Default to npm
  return "npm";
}

/**
 * Gets the run command for the detected package manager.
 *
 * @param {string} script - The script name to run
 * @returns {Promise<CommandConfig>} The command configuration to execute
 */
export async function getRunCommand(script: string[]): Promise<CommandConfig> {
  const packageManager = await detectPackageManager();

  switch (packageManager) {
    case "yarn":
      return { cmd: "yarn", args: script };
    case "pnpm":
      return { cmd: "pnpm", args: script };
    case "bun":
      return { cmd: "bun", args: ["run", ...script] };
    default:
      return { cmd: "npm", args: ["run", ...script] };
  }
}

/**
 * Reads and parses the package.json file.
 *
 * @returns {Promise<PackageJson | null>} The parsed package.json or null if not found/invalid
 */
export async function readPackageJson(): Promise<PackageJson | null> {
  try {
    const content = await Deno.readTextFile("package.json");
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
export function hasDependency(
  packageJson: PackageJson | null,
  dependency: string,
): boolean {
  if (!packageJson) return false;

  return !!(
    (packageJson.dependencies && dependency in packageJson.dependencies) ??
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
export function hasScript(
  packageJson: PackageJson | null,
  scriptName: string,
): boolean {
  if (!packageJson?.scripts) return false;

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
  if (!packageJson?.scripts) return undefined;

  return Object.keys(packageJson.scripts).find((script) =>
    script.includes(pattern)
  );
}

/**
 * Safely gets a script from package.json
 *
 * @param {PackageJson | null} packageJson - The package.json object
 * @param {string} scriptName - The script name to get
 * @returns {string | undefined} The script content or undefined if not found
 */
export function getScript(
  packageJson: PackageJson | null,
  scriptName: string,
): string | undefined {
  if (!packageJson?.scripts) return undefined;

  return packageJson.scripts[scriptName];
}
