import { McpError } from "../types/error.ts";
import type { CursorServerConfig } from "../types/cursor.ts";
import type { ZypherMcpServer } from "../types/local.ts";

export function extractConfigFromZypherMcpServer(
  localServer: ZypherMcpServer,
): CursorServerConfig {
  // Check if this is a CLI server (has packages) or Remote server (has remotes)
  if (localServer.packages?.length) {
    // CLI configuration
    const firstPackage = localServer.packages[0];

    // Convert environment variables from array to object
    const env = firstPackage.environmentVariables?.reduce((acc, envVar) => {
      if (envVar.value !== undefined) {
        acc[envVar.name] = envVar.value;
      }
      return acc;
    }, {} as Record<string, string>);

    return {
      command: firstPackage.registryName,
      args: firstPackage.packageArguments?.map((arg) =>
        arg.value || arg.name || ""
      ) || [],
      ...(env && Object.keys(env).length > 0 && { env }),
    };
  } else if (localServer.remotes?.length) {
    // Remote configuration
    const firstRemote = localServer.remotes[0];

    return {
      url: firstRemote.url,
      // Note: headers and env are not preserved in Remote ZypherMcpServer conversion for now
    };
  } else {
    throw new McpError(
      "server_error",
      "LocalServer must have either packages or remotes",
    );
  }
}
