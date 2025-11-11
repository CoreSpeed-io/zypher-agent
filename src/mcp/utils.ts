import { z } from "zod";
import type {
  Argument,
  Package,
  ServerDetail,
} from "@corespeed/mcp-store-client";
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
  args?: Array<Argument>,
): string[] {
  if (!args) return [];

  const result: string[] = [];

  for (const arg of args) {
    // Skip arguments without a value
    if (arg.value === undefined) continue;

    // Handle named arguments: include the name with the value
    if (arg.type === "named" && arg.name) {
      // Use --name=value format for named arguments
      result.push(`--${arg.name}=${arg.value}`);
    } else {
      // Handle positional arguments: just the value
      result.push(arg.value);
    }
  }

  return result;
}

/**
 * Build command arguments based on the package runtime hint
 */
function buildCommandArgs(
  pkg: Package,
  runtimeArgs: string[],
  packageArgs: string[],
): string[] {
  const runtimeHint = pkg.runtimeHint?.toLowerCase();

  // Handle docker runtime specially - needs "run" subcommand
  if (runtimeHint === "docker") {
    const image = pkg.version ? `${pkg.name}:${pkg.version}` : pkg.name;
    return ["run", ...runtimeArgs, image, ...packageArgs];
  }

  // Handle python runtime specially - doesn't use @version syntax
  if (runtimeHint === "python") {
    return [...runtimeArgs, pkg.name, ...packageArgs];
  }

  // For npm/npx, uvx, and other runtimes that support @version syntax:
  // [runtime args] [package@version] [package args]
  const pkgName = pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
  return [...runtimeArgs, pkgName, ...packageArgs];
}

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

    if (!pkg.runtimeHint) {
      throw new Error(
        `Package for server ${serverDetail.id} is missing runtimeHint`,
      );
    }

    const runtimeArgs = extractArguments(pkg.runtimeArguments);
    const packageArgs = extractArguments(pkg.packageArguments);

    const args = buildCommandArgs(pkg, runtimeArgs, packageArgs);

    const env = convertToRecord(pkg.environmentVariables);

    return {
      id: serverDetail.scope + "/" + serverDetail.packageName,
      displayName: serverDetail.displayName,
      type: "command",
      command: {
        command: pkg.runtimeHint,
        args,
        env,
      },
    };
  }

  throw new Error(
    `Server ${serverDetail.id} has no valid remote or package configuration`,
  );
}
