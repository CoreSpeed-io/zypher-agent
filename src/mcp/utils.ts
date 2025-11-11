import { z } from "zod";
import type { Package, ServerDetail } from "@corespeed/mcp-store-client";
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
 * Convert array of {name, value} objects to a Record, filtering out invalid entries
 */
function convertToRecord(
  items?: Array<{ name?: string; value?: string }>,
): Record<string, string> | undefined {
  if (!items?.length) return undefined;

  const entries = items
    .filter((item): item is { name: string; value: string } =>
      !!item.name && !!item.value
    )
    .map((item) => [item.name, item.value] as [string, string]);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Extract string values from an array of {value} objects, filtering out undefined values
 */
function extractArguments(
  args?: Array<{ value?: string }>,
): string[] {
  return args?.map((a) => a.value).filter((v): v is string =>
    v !== undefined
  ) ?? [];
}

const REGISTRY_CONFIG: Record<string, {
  command: string;
  buildArgs: (
    pkg: Package,
    runtimeArgs: string[],
    packageArgs: string[],
  ) => string[];
}> = {
  npm: {
    command: "npx",
    buildArgs: (pkg, runtimeArgs, packageArgs) => {
      const pkgName = pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
      // npx [runtime args (including -y)] [package] [package args]
      return [...runtimeArgs, pkgName, ...packageArgs];
    },
  },
  pypi: {
    command: "python",
    buildArgs: (pkg, runtimeArgs, packageArgs) => {
      // python [runtime args (including -m)] [package] [package args]
      return [...runtimeArgs, pkg.name, ...packageArgs];
    },
  },
  uv: {
    command: "uvx",
    buildArgs: (pkg, runtimeArgs, packageArgs) => {
      const pkgName = pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
      // uvx [runtime args] [package] [package args]
      return [...runtimeArgs, pkgName, ...packageArgs];
    },
  },
  docker: {
    command: "docker",
    buildArgs: (pkg, runtimeArgs, packageArgs) => {
      const image = pkg.version ? `${pkg.name}:${pkg.version}` : pkg.name;
      // docker run [runtime args] [image] [package args]
      return ["run", ...runtimeArgs, image, ...packageArgs];
    },
  },
};

/**
 * Convert CoreSpeed ServerDetail to McpServerEndpoint
 */
export function convertServerDetailToEndpoint(
  serverDetail: ServerDetail,
): McpServerEndpoint {
  // Prefer remote configuration if available
  if (serverDetail.remotes?.[0]) {
    const remote = serverDetail.remotes[0];
    const headers = convertToRecord(remote.headers);

    return {
      id: serverDetail.scope + "/" + serverDetail.packageName,
      displayName: serverDetail.displayName,
      type: "remote",
      remote: {
        url: remote.url,
        headers,
      },
    };
  }

  // Fall back to package/command configuration
  if (serverDetail.packages?.[0]) {
    const pkg = serverDetail.packages[0];
    const registry = pkg.registryName?.toLowerCase();
    const config = registry ? REGISTRY_CONFIG[registry] : undefined;

    if (!config) {
      throw new Error(
        `Unsupported registry: ${pkg.registryName}. Supported registries: ${
          Object.keys(REGISTRY_CONFIG).join(", ")
        }.`,
      );
    }

    const runtimeArgs = extractArguments(pkg.runtimeArguments);
    const packageArgs = extractArguments(pkg.packageArguments);

    const args = config.buildArgs(pkg, runtimeArgs, packageArgs);

    const env = convertToRecord(pkg.environmentVariables);

    return {
      id: serverDetail.scope + "/" + serverDetail.packageName,
      displayName: serverDetail.displayName,
      type: "command",
      command: {
        command: config.command,
        args,
        env,
      },
    };
  }

  throw new Error(
    `Server ${serverDetail.id} has no valid remote or package configuration`,
  );
}
