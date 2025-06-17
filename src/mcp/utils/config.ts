import type { CursorServerConfig } from "../types/cursor.ts";
import type { ZypherMcpServer } from "../types/local.ts";

export function extractConfigFromZypherMcpServer(
  localServer: ZypherMcpServer,
): CursorServerConfig {
  // Get the first package from the ZypherMcpServer
  const firstPackage = localServer.packages?.[0];

  if (!firstPackage) {
    throw new Error("ZypherMcpServer must have at least one package");
  }

  // Convert environment variables from array to object
  const env = firstPackage.environmentVariables?.reduce((acc, envVar) => {
    if (envVar.value !== undefined) {
      acc[envVar.name] = envVar.value;
    }
    return acc;
  }, {} as Record<string, string>);

  // Check if this is CLI config (has packageArguments) or Remote config
  const hasArguments = firstPackage.packageArguments &&
    firstPackage.packageArguments.length > 0;

  if (hasArguments) {
    // CLI configuration
    return {
      command: firstPackage.registryName,
      args: firstPackage.packageArguments?.map((arg) =>
        arg.name || arg.valueHint || ""
      ) || [],
      ...(env && Object.keys(env).length > 0 && { env }),
    };
  } else {
    // Remote configuration
    return {
      url: firstPackage.registryName,
      ...(env && Object.keys(env).length > 0 && { env }),
      // Note: headers are not preserved in ZypherMcpServer conversion
    };
  }
}
