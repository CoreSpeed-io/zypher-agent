import type { ErrorDetector } from "./interface.ts";
import { extractErrorOutput } from "./utils.ts";
import { fileExists } from "../utils/mod.ts";

/**
 * Detector for Python linting errors using flake8
 */
export class PythonFlake8ErrorDetector implements ErrorDetector {
  name = "Flake8";
  description = "Detects Python code style and quality issues using flake8";

  async isApplicable(): Promise<boolean> {
    try {
      // Check if requirements.txt or pyproject.toml exists
      if (await fileExists("requirements.txt")) {
        return true;
      }

      if (await fileExists("pyproject.toml")) {
        return true;
      }

      if (await fileExists("setup.py")) {
        return true;
      }

      // No Python project files found
      return false;
    } catch {
      return false;
    }
  }

  async detect(): Promise<string | null> {
    try {
      // Check if flake8 is installed
      try {
        await new Deno.Command("which", { args: ["flake8"] }).output();
      } catch {
        // flake8 not installed, try with python -m
        try {
          await new Deno.Command("python", {
            args: ["-m", "flake8", "--version"],
          }).output();
        } catch {
          return null; // flake8 not available
        }
      }

      // Run flake8
      try {
        const result = await new Deno.Command("flake8", { args: ["."] })
          .output();
        // If we get here with no stdout, there are no errors
        if (!result.stdout) {
          return null;
        }
        return `Python flake8 errors detected:\n${result.stdout}`;
      } catch (error) {
        const errorOutput = extractErrorOutput(error, (output) => output);

        if (errorOutput) {
          return `Python flake8 errors detected:\n${errorOutput}`;
        }

        return null;
      }
    } catch {
      return null;
    }
  }
}

/**
 * Detector for Python type errors using mypy
 */
export class PythonMypyErrorDetector implements ErrorDetector {
  name = "Mypy";
  description = "Detects Python type errors using mypy";

  async isApplicable(): Promise<boolean> {
    try {
      // Check if it's a Python project
      const isPythonProject = await new PythonFlake8ErrorDetector()
        .isApplicable();
      if (!isPythonProject) return false;

      // Check if mypy is available
      try {
        await new Deno.Command("which", { args: ["mypy"] }).output();
        return true;
      } catch {
        try {
          await new Deno.Command("python", {
            args: ["-m", "mypy", "--version"],
          }).output();
          return true;
        } catch {
          return false; // mypy not available
        }
      }
    } catch {
      return false;
    }
  }

  async detect(): Promise<string | null> {
    try {
      // Run mypy
      try {
        const result = await new Deno.Command("mypy", { args: ["."] }).output();
        // If we get here with no stdout, there are no errors
        if (!result.stdout) {
          return null;
        }
        return `Python mypy errors detected:\n${result.stdout}`;
      } catch (error) {
        const errorOutput = extractErrorOutput(error, (output) => output);

        if (errorOutput) {
          return `Python mypy errors detected:\n${errorOutput}`;
        }

        return null;
      }
    } catch {
      return null;
    }
  }
}
