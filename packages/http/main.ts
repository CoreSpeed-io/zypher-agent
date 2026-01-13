import { createModel, createZypherAgent } from "@zypher/agent";
import {
  createFileSystemTools,
  createImageTools,
  RunTerminalCmdTool,
} from "@zypher/agent/tools";
import { Command, EnumType } from "@cliffy/command";
import { createZypherHandler } from "./handler.ts";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OPENAI_MODEL = "gpt-4o-2024-11-20";

const providerType = new EnumType(["anthropic", "openai"]);

function inferProvider(
  provider?: string,
  model?: string,
): "anthropic" | "openai" {
  const p = provider?.toLowerCase();
  if (p === "openai" || p === "anthropic") return p;
  if (!model) return "anthropic";
  const m = model.toLowerCase();
  if (
    m.includes("claude") || m.startsWith("sonnet") || m.startsWith("haiku") ||
    m.startsWith("opus")
  ) {
    return "anthropic";
  }
  return "openai";
}

export async function main(): Promise<void> {
  const { options: cli } = await new Command()
    .name("zypher-http")
    .description("Zypher Agent HTTP Server")
    .type("provider", providerType)
    .option("-k, --api-key <apiKey:string>", "Model provider API key", {
      required: true,
    })
    .option("-m, --model <model:string>", "Model name")
    .option("-P, --provider <provider:provider>", "Model provider")
    .option("-b, --base-url <baseUrl:string>", "Custom API base URL")
    .option(
      "-w, --workDir <workingDirectory:string>",
      "Working directory for agent operations",
    )
    .option("-u, --user-id <userId:string>", "Custom user ID")
    .option(
      "--openai-api-key <openaiApiKey:string>",
      "OpenAI API key for image tools when provider=anthropic",
    )
    .option("-p, --port <port:number>", "Port to listen on", {
      default: 8080,
    })
    .option("--host <host:string>", "Host to bind to", {
      default: "0.0.0.0",
    })
    .parse(Deno.args);

  const selectedProvider = inferProvider(cli.provider, cli.model);
  const modelId = cli.model ??
    (selectedProvider === "openai"
      ? DEFAULT_OPENAI_MODEL
      : DEFAULT_ANTHROPIC_MODEL);

  const modelProvider = createModel(`${selectedProvider}/${modelId}`, {
    apiKey: cli.apiKey,
    baseUrl: cli.baseUrl,
  });

  const openaiApiKey = cli.provider === "openai"
    ? cli.apiKey
    : cli.openaiApiKey;

  const tools = [
    ...createFileSystemTools(),
    RunTerminalCmdTool,
    ...(openaiApiKey ? createImageTools(openaiApiKey) : []),
  ];

  const agent = await createZypherAgent({
    modelProvider,
    workingDirectory: cli.workDir,
    tools,
    context: { userId: cli.userId },
  });

  const app = createZypherHandler({ agent });

  Deno.serve({
    port: cli.port,
    hostname: cli.host,
    onListen: ({ hostname, port }) => {
      console.log(`Zypher HTTP server listening on http://${hostname}:${port}`);
      console.log(`Provider: ${selectedProvider}`);
      console.log(`Model: ${modelId}`);
      if (cli.baseUrl) console.log(`Base URL: ${cli.baseUrl}`);
      if (cli.workDir) console.log(`Working directory: ${cli.workDir}`);
      if (cli.userId) console.log(`User ID: ${cli.userId}`);
      console.log(`Tools: ${Array.from(agent.mcp.tools.keys()).join(", ")}`);
    },
  }, app.fetch);
}

if (import.meta.main) {
  main();
}
