import { Command } from "@cliffy/command";
import {
  createModelProvider,
  createZypherAgent,
  DEFAULT_MODELS,
} from "@zypher/agent";
import {
  createFileSystemTools,
  createImageTools,
  RunTerminalCmdTool,
} from "@zypher/agent/tools";
import { createZypherHandler } from "./handler.ts";

export async function main(): Promise<void> {
  const { options: cli } = await new Command()
    .name("zypher-http")
    .description("Zypher Agent HTTP Server")
    .option(
      "-k, --api-key <apiKey:string>",
      "Model provider API key (uses env var if not provided)",
    )
    .option("-m, --model <model:string>", "Model name (provider auto-detected)")
    .option("-b, --base-url <baseUrl:string>", "Custom API base URL")
    .option(
      "-w, --workDir <workingDirectory:string>",
      "Working directory for agent operations",
    )
    .option("-u, --user-id <userId:string>", "Custom user ID")
    .option(
      "--openai-api-key <openaiApiKey:string>",
      "OpenAI API key for image tools when using Anthropic models",
    )
    .option("-p, --port <port:number>", "Port to listen on", {
      default: 8080,
    })
    .option("--host <host:string>", "Host to bind to", {
      default: "0.0.0.0",
    })
    .parse(Deno.args);

  // Model string with auto-inferred provider
  const modelString = cli.model ?? DEFAULT_MODELS.openai;

  const modelProvider = createModelProvider(modelString, {
    apiKey: cli.apiKey,
    baseUrl: cli.baseUrl,
  });

  // Use OpenAI key for image tools
  const openaiApiKey =
    modelProvider.info.name === "openai" ? cli.apiKey : cli.openaiApiKey;

  const tools = [
    ...createFileSystemTools(),
    RunTerminalCmdTool,
    ...(openaiApiKey ? createImageTools(openaiApiKey) : []),
  ];

  const agent = await createZypherAgent({
    model: modelProvider,
    workingDirectory: cli.workDir,
    tools,
    context: { userId: cli.userId },
  });

  const app = createZypherHandler({ agent });

  Deno.serve(
    {
      port: cli.port,
      hostname: cli.host,
      onListen: ({ hostname, port }) => {
        console.log(
          `Zypher HTTP server listening on http://${hostname}:${port}`,
        );
        console.log(`Provider: ${modelProvider.info.name}`);
        console.log(`Model: ${modelProvider.modelId}`);
        if (cli.baseUrl) console.log(`Base URL: ${cli.baseUrl}`);
        if (cli.workDir) console.log(`Working directory: ${cli.workDir}`);
        if (cli.userId) console.log(`User ID: ${cli.userId}`);
        console.log(`Tools: ${Array.from(agent.mcp.tools.keys()).join(", ")}`);
      },
    },
    app.fetch,
  );
}

if (import.meta.main) {
  main();
}
