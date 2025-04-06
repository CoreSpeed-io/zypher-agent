import type { ErrorDetector } from "./interface.ts";
import { extractErrorOutput } from "./utils.ts";
import { fileExists } from "../utils/index.ts";

/**
 * Detector for Go linting errors
 */
export class GoLintErrorDetector implements ErrorDetector {
  name = "golint";
  description = "Detects Go code style and quality issues";

  async isApplicable(): Promise<boolean> {
    try {
      // Check if go.mod exists
      return await fileExists("go.mod");
    } catch {
      return false;
    }
  }

  async detect(): Promise<string | null> {
    try {
      // Check if golint is installed
      try {
        const whichCmd = await new Deno.Command("which", {
          args: ["golint"],
        }).output();
        if (!whichCmd.success) {
          throw new Error("golint not found");
        }
      } catch {
        try {
          const goListCmd = await new Deno.Command("go", {
            args: ["list", "-f", "{{.Target}}", "golang.org/x/lint/golint"],
          }).output();
          if (!goListCmd.success) {
            return null; // golint not available
          }
        } catch {
          return null; // golint not available
        }
      }

      // Run golint
      try {
        const golintCmd = await new Deno.Command("golint", {
          args: ["./..."],
        }).output();
        
        const stdout = new TextDecoder().decode(golintCmd.stdout);
        if (stdout) {
          return `Go lint errors detected:\n${stdout}`;
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
  name = "go vet";
  description = "Detects suspicious constructs in Go code";

  async isApplicable(): Promise<boolean> {
    try {
      // Check if go.mod exists
      return await fileExists("go.mod");
    } catch {
      return false;
    }
  }

  async detect(): Promise<string | null> {
    try {
      // Run go vet
      try {
        const goVetCmd = await new Deno.Command("go", {
          args: ["vet", "./..."],
        }).output();
        
        // If stderr is empty, there are no errors
        const stderr = new TextDecoder().decode(goVetCmd.stderr);
        if (!stderr) {
          return null;
        }
        return `Go vet errors detected:\n${stderr}`;
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
