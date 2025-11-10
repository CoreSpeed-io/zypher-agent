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

const REGISTRY_CONFIG: Record<string, {
  command: string;
  buildArgs: (pkg: Package) => string[];
}> = {
  npm: {
    command: "npx",
    buildArgs: (pkg) => {
      const pkgName = pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
      return ["-y", pkgName];
    },
  },
  pypi: {
    command: "python",
    buildArgs: (pkg) => ["-m", pkg.name],
  },
  uv: {
    command: "uvx",
    buildArgs: (pkg) => {
      const pkgName = pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
      return [pkgName];
    },
  },
  docker: {
    command: "docker",
    buildArgs: (pkg) => {
      const image = pkg.version ? `${pkg.name}:${pkg.version}` : pkg.name;
      return ["run", image];
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
    const headers = remote.headers?.length
      ? Object.fromEntries(
        remote.headers
          .filter((h): h is { name: string; value: string } =>
            !!h.name && !!h.value
          )
          .map((h) => [h.name, h.value]),
      )
      : undefined;

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

    const args = [
      ...config.buildArgs(pkg),
      ...(pkg.packageArguments?.map((a) => a.value).filter((v): v is string =>
        v !== undefined
      ) ?? []),
      ...(pkg.runtimeArguments?.map((a) => a.value).filter((v): v is string =>
        v !== undefined
      ) ?? []),
    ];

    const env = pkg.environmentVariables?.length
      ? Object.fromEntries(
        pkg.environmentVariables
          .filter((e): e is { name: string; value: string } =>
            !!e.name && !!e.value
          )
          .map((e) => [e.name, e.value]),
      )
      : undefined;

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
