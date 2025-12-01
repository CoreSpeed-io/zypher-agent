import "@std/dotenv/load";
import {
  AnthropicModelProvider,
  createZypherAgent,
  formatError,
  OpenAIModelProvider,
  runAgentInTerminal,
} from "@zypher/mod.ts";
import {
  createFileSystemTools,
  createImageTools,
  RunTerminalCmdTool,
} from "@zypher/tools/mod.ts";
import { Command, EnumType } from "@cliffy/command";
import chalk from "chalk";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OPENAI_MODEL = "gpt-4o-2024-11-20";

const providerType = new EnumType(["anthropic", "openai"]);

// Parse command line arguments using Cliffy
const { options: cli } = await new Command()
  .name("zypher")
  .description("Zypher Agent CLI")
  .type("provider", providerType)
  .option("-k, --api-key <apiKey:string>", "Model provider API key", {
    required: true,
  })
  .option("-m, --model <model:string>", "Model name")
  .option(
    "-p, --provider <provider:provider>",
    "Model provider",
  )
  .option("-b, --base-url <baseUrl:string>", "Custom API base URL")
  .option(
    "-w, --workDir <workingDirectory:string>",
    "Working directory for agent operations",
  )
  .option("-u, --user-id <userId:string>", "Custom user ID")
  .option(
    "--openai-api-key <openaiApiKey:string>",
    "OpenAI API key for image tools when provider=anthropic (ignored if provider=openai)",
  )
  .parse(Deno.args);

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
  return "openai"; // fallback to OpenAI-compatible models
}

async function main(): Promise<void> {
  try {
    // Log CLI configuration
    if (cli.userId) {
      console.log(`👤 Using user ID: ${cli.userId}`);
    }

    if (cli.baseUrl) {
      console.log(`🌐 Using API base URL: ${cli.baseUrl}`);
    }

    if (cli.workDir) {
      console.log(`💻 Using working directory: ${cli.workDir}`);
    }

    const selectedProvider = inferProvider(cli.provider, cli.model);
    console.log(`🤖 Using provider: ${chalk.magenta(selectedProvider)}`);

    const modelToUse = cli.model ??
      (selectedProvider === "openai"
        ? DEFAULT_OPENAI_MODEL
        : DEFAULT_ANTHROPIC_MODEL);
    console.log(`🧠 Using model: ${chalk.cyan(modelToUse)}`);

    // Initialize the agent with provided options
    const providerInstance = selectedProvider === "openai"
      ? new OpenAIModelProvider({
        apiKey: cli.apiKey,
        baseUrl: cli.baseUrl,
      })
      : new AnthropicModelProvider({
        apiKey: cli.apiKey,
        baseUrl: cli.baseUrl,
      });

    // Build tools list
    const openaiApiKey = cli.provider === "openai"
      ? cli.apiKey
      : cli.openaiApiKey;

    const tools = [
      ...createFileSystemTools(),
      RunTerminalCmdTool,
      ...(openaiApiKey ? createImageTools(openaiApiKey) : []),
    ];

    const agent = await createZypherAgent({
      modelProvider: providerInstance,
      workingDirectory: cli.workDir,
      tools,
      context: { userId: cli.userId },
    });

    console.log(
      "🔧 Registered tools:",
      Array.from(agent.mcp.tools.keys()).join(", "),
    );

    await runAgentInTerminal(agent, modelToUse);
  } catch (error) {
    console.error("Fatal Error:", formatError(error));
    Deno.exit(1);
  }
}

// Handle Ctrl+C
Deno.addSignalListener("SIGINT", () => {
  console.log("\n\nGoodbye! 👋\n");
  Deno.exit(0);
});

// Run the CLI
main().catch((error) => {
  console.error("Unhandled error:", formatError(error));
  Deno.exit(1);
});
