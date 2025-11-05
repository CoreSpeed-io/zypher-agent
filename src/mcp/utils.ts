import { z } from "zod";
import type { Package, ServerDetail } from "@corespeed/mcp-store-client/types";
import type { McpServerEndpoint } from "./mod.ts";

// =============================================================================
// Zod utilities
// =============================================================================

export function jsonToZod(inputSchema: {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
}): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const properties = inputSchema.properties ?? {};
  const required = inputSchema.required ?? [];

  const schemaProperties = Object.entries(properties).reduce(
    (acc: Record<string, z.ZodTypeAny>, [key, value]) => {
      const property = value as { type: string; description?: string };
      const zodType = createZodType(property);
      acc[key] = required.includes(key) ? zodType : zodType.optional();
      return acc;
    },
    {} as Record<string, z.ZodTypeAny>,
  );

  return z.object(schemaProperties);
}

export function createZodType(property: {
  type: string;
  description?: string;
}): z.ZodTypeAny {
  const typeMap: Record<string, () => z.ZodTypeAny> = {
    string: () => z.string(),
    number: () => z.number(),
    boolean: () => z.boolean(),
    array: () => z.array(z.any()),
    object: () => z.record(z.any()),
  };

  const zodType = typeMap[property.type]?.() ?? z.any();
  return property.description
    ? zodType.describe(property.description)
    : zodType;
}

// =============================================================================
// MCP Store registry utilities
// =============================================================================

/**
 * Convert CoreSpeed ServerDetail to McpServerEndpoint
 */
export function convertServerDetailToEndpoint(
  serverDetail: ServerDetail,
): McpServerEndpoint {
  // Prefer remote configuration if available
  if (serverDetail.remotes && serverDetail.remotes.length > 0) {
    const remote = serverDetail.remotes[0];
    return {
      id: serverDetail.id,
      displayName: serverDetail.name,
      type: "remote",
      remote: {
        url: remote.url,
        headers: remote.headers?.reduce(
          (acc: Record<string, string>, h) => {
            if (h.name && h.value) {
              acc[h.name] = h.value;
            }
            return acc;
          },
          {} as Record<string, string>,
        ),
      },
    };
  }

  // Fall back to package/command configuration
  if (serverDetail.packages && serverDetail.packages.length > 0) {
    const pkg = serverDetail.packages[0];

    // Build command based on registry
    const command = buildCommand(pkg);
    const args = buildArgs(pkg);
    const env = buildEnv(pkg);

    return {
      id: serverDetail.id,
      displayName: serverDetail.name,
      type: "command",
      command: {
        command,
        args,
        env,
      },
    };
  }

  // No valid configuration found
  throw new Error(
    `Server ${serverDetail.id} has no valid remote or package configuration`,
  );
}

/**
 * Build the command string from package info
 */
export function buildCommand(pkg: {
  registryName?: string;
  name: string;
  version?: string;
}): string {
  // Map registry name to command
  switch (pkg.registryName?.toLowerCase()) {
    case "npm":
      return "npx";
    case "pypi":
      return "python";
    case "uv":
      return "uvx";
    case "docker":
      return "docker";
    default:
      throw new Error(
        `Unsupported registry: ${pkg.registryName}. Supported registries: npm, pypi, uv, docker.`,
      );
  }
}

/**
 * Build command arguments from package info
 */
export function buildArgs(pkg: Package): string[] {
  const args: string[] = [];

  // Add registry-specific args
  switch (pkg.registryName?.toLowerCase()) {
    case "npm": {
      args.push("-y"); // Auto-yes for npx
      const pkgName = pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
      args.push(pkgName);
      break;
    }
    case "pypi": {
      args.push("-m");
      args.push(pkg.name);
      break;
    }
    case "uv": {
      // uvx package@version or uvx package
      const pkgName = pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
      args.push(pkgName);
      break;
    }
    case "docker": {
      // docker run image:tag or docker run image
      args.push("run");
      const imageName = pkg.version ? `${pkg.name}:${pkg.version}` : pkg.name;
      args.push(imageName);
      break;
    }
    default: {
      throw new Error(
        `Unsupported registry: ${pkg.registryName}. Supported registries: npm, pypi, uv, docker.`,
      );
    }
  }

  // Add package arguments
  if (pkg.packageArguments) {
    args.push(
      ...pkg.packageArguments
        .map((a) => a.value)
        .filter((v): v is string => v !== undefined),
    );
  }

  // Add runtime arguments
  if (pkg.runtimeArguments) {
    args.push(
      ...pkg.runtimeArguments
        .map((a) => a.value)
        .filter((v): v is string => v !== undefined),
    );
  }

  return args;
}

/**
 * Build environment variables from package info
 */
export function buildEnv(pkg: Package): Record<string, string> | undefined {
  if (!pkg.environmentVariables || pkg.environmentVariables.length === 0) {
    return undefined;
  }

  return pkg.environmentVariables.reduce(
    (acc: Record<string, string>, envVar) => {
      if (envVar.name && envVar.value) {
        acc[envVar.name] = envVar.value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );
}
