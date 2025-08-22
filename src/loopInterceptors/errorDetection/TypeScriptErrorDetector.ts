import type { ErrorDetector } from "./interface.ts";
import { extractErrorOutput } from "./utils.ts";
import { fileExists } from "../../utils/mod.ts";

// Workaround for Deno.Command not throwing an error when the command returns a non-zero exit code
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Detector for ESLint errors in JavaScript/TypeScript projects
 */
export class ESLintErrorDetector implements ErrorDetector {
  name = "ESLint";
  description = "Detects code style and potential issues using ESLint";

  async isApplicable(): Promise<boolean> {
    try {
      const packageJson = await readPackageJson();

      // Check if eslint is in dependencies or devDependencies
      const hasEslint = hasDependency(packageJson, "eslint");

      // Also check if there are lint scripts
      const hasLintScript = hasScript(packageJson, "lint") ||
        hasScript(packageJson, "eslint") ||
        !!findScriptByPattern(packageJson, "lint");

      return hasEslint || hasLintScript;
    } catch {
      return false;
    }
  }

  async detect(): Promise<string | null> {
    try {
      // Determine the command to run
      const commandConfig = await this.determineCommand();

      // Execute the command
      try {
        // If we get here, the command succeeded (no errors)
        await new Deno.Command(commandConfig.cmd, {
          args: commandConfig.args || [],
        }).output();
        return null;
      } catch (error) {
        // Command failed, which likely means it found errors
        const errorOutput = extractErrorOutput(
          error,
          (output) => this.filterNonErrors(output),
        );

        if (errorOutput) {
          return `ESLint errors detected:\n${errorOutput}`;
        }
      }

      return null;
    } catch (error) {
      console.warn("Error running ESLint check:", error);
      return null;
    }
  }

  /**
   * Determines the command to run for ESLint
   *
   * @returns {Promise<CommandConfig>} The command configuration to execute
   * @private
   */
  private async determineCommand(): Promise<CommandConfig> {
    const packageJson = await readPackageJson();

    // If package.json has a lint script, use it
    if (packageJson?.scripts) {
      // Find the appropriate script name
      let scriptName: string | undefined;

      if (hasScript(packageJson, "lint")) {
        scriptName = "lint";
      } else if (hasScript(packageJson, "eslint")) {
        scriptName = "eslint";
      } else {
        scriptName = findScriptByPattern(packageJson, "lint");
      }

      if (scriptName) {
        return await getRunCommand([scriptName]);
      }
    }

    // For direct commands, we'll use the eslint binary directly
    // but still respect the package manager via getRunCommand
    return await getRunCommand(["eslint", ".", "--ext", ".js,.jsx,.ts,.tsx"]);
  }

  /**
   * Filters out npm notices and other non-error output
   *
   * @param {string} output - The command output to filter
   * @returns {string} Filtered output containing only actual errors
   */
  private filterNonErrors(output: string): string {
    // Split by lines
    const lines = output.split("\n");

    // Filter out npm notices and empty lines
    const errorLines = lines.filter((line) => {
      // Skip npm notices
      if (line.trim().startsWith("npm notice")) return false;
      // Skip empty lines
      if (line.trim() === "") return false;
      // Skip npm warnings that aren't related to the code
      if (line.includes("npm WARN")) return false;
      return true;
    });

    return errorLines.join("\n");
  }
}

/**
 * Detector for TypeScript compiler errors
 */
export class TypeScriptErrorDetector implements ErrorDetector {
  name = "TypeScript";
  description = "Detects type errors using the TypeScript compiler";

  async isApplicable(): Promise<boolean> {
    try {
      // Check package.json first
      const packageJson = await readPackageJson();
      if (packageJson) {
        // Check if typescript is in dependencies
        const hasTypeScript = hasDependency(packageJson, "typescript");

        // Check if there are type-check scripts
        const hasTypeCheckScript = hasScript(packageJson, "type-check") ||
          hasScript(packageJson, "typecheck") ||
          hasScript(packageJson, "tsc") ||
          !!findScriptByPattern(packageJson, "type") ||
          !!findScriptByPattern(packageJson, "tsc");

        if (hasTypeScript || hasTypeCheckScript) {
          return true;
        }
      }

      // Fallback to checking for tsconfig.json
      return await fileExists("tsconfig.json");
    } catch {
      return false;
    }
  }

  async detect(): Promise<string | null> {
    try {
      // Determine the command to run
      const commandConfig = await this.determineCommand();

      // Execute the command
      try {
        // If we get here, the command succeeded (no errors)
        await execAsync(
          `${commandConfig.cmd} ${commandConfig.args?.join(" ")}`,
        );
        return null;
      } catch (error) {
        // Command failed, which likely means it found errors
        const errorOutput = extractErrorOutput(
          error,
          (output) => this.filterNonErrors(output),
        );

        if (errorOutput) {
          return `TypeScript errors detected:\n${errorOutput}`;
        }
      }

      return null;
    } catch (error) {
      console.warn("Error running TypeScript check:", error);
      return null;
    }
  }

  /**
   * Determines the command to run for TypeScript
   *
   * @returns {Promise<CommandConfig>} The command configuration to execute
   * @private
   */
  private async determineCommand(): Promise<CommandConfig> {
    const packageJson = await readPackageJson();

    // If package.json has a type-check script, use it
    if (packageJson?.scripts) {
      // Find the appropriate script name
      let scriptName: string | undefined;

      if (hasScript(packageJson, "type-check")) {
        scriptName = "type-check";
      } else if (hasScript(packageJson, "typecheck")) {
        scriptName = "typecheck";
      } else if (hasScript(packageJson, "tsc")) {
        scriptName = "tsc";
      } else {
        scriptName = findScriptByPattern(packageJson, "type") ??
          findScriptByPattern(packageJson, "tsc");
      }

      if (scriptName) {
        return await getRunCommand([scriptName]);
      }
    }

    // For direct commands, we'll use the tsc binary directly
    // but still respect the package manager via getRunCommand
    return await getRunCommand(["tsc", "--noEmit"]);
  }

  /**
   * Filters out npm notices and other non-error output
   *
   * @param {string} output - The command output to filter
   * @returns {string} Filtered output containing only actual errors
   */
  private filterNonErrors(output: string): string {
    // Split by lines
    const lines = output.split("\n");

    // Filter out npm notices and empty lines
    const errorLines = lines.filter((line) => {
      // Skip npm notices
      if (line.trim().startsWith("npm notice")) return false;
      // Skip empty lines
      if (line.trim() === "") return false;
      // Skip npm warnings that aren't related to the code
      if (line.includes("npm WARN")) return false;
      return true;
    });

    return errorLines.join("\n");
  }
}

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
