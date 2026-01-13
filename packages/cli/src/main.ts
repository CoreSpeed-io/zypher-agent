import "@std/dotenv/load";
import {
  createModel,
  createZypherAgent,
  DEFAULT_MODELS,
  formatError,
} from "@zypher/agent";
import {
  createFileSystemTools,
  createImageTools,
  RunTerminalCmdTool,
} from "@zypher/agent/tools";
import { Command, EnumType } from "@cliffy/command";
import chalk from "chalk";
import { runAgentInTerminal } from "./runAgentInTerminal.ts";

const providerType = new EnumType(["anthropic", "openai"]);

export async function main(): Promise<void> {
  // Parse command line arguments using Cliffy
  const { options: cli } = await new Command()
    .name("zypher")
    .description("Zypher Agent CLI")
    .type("provider", providerType)
    .option(
      "-k, --api-key <apiKey:string>",
      "Model provider API key (uses env var if not provided)",
    )
    .option("-m, --model <model:string>", "Model name")
    .option(
      "-p, --provider <provider:provider>",
      "Model provider (auto-detected from model name if not specified)",
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

    // Build model string: explicit provider/model or just model (auto-inferred)
    const modelString = cli.provider && cli.model
      ? `${cli.provider}/${cli.model}`
      : cli.model ?? DEFAULT_MODELS.openai;

    // Initialize the model provider
    const modelProvider = createModel(modelString, {
      apiKey: cli.apiKey,
      baseUrl: cli.baseUrl,
    });

    console.log(`🤖 Using provider: ${chalk.magenta(modelProvider.info.name)}`);
    console.log(`🧠 Using model: ${chalk.cyan(modelProvider.modelId)}`);

    // Build tools list - use OpenAI key for image tools
    const openaiApiKey = modelProvider.info.name === "openai"
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

    console.log(
      "🔧 Registered tools:",
      Array.from(agent.mcp.tools.keys()).join(", "),
    );

    // Handle Ctrl+C
    Deno.addSignalListener("SIGINT", () => {
      console.log("\n\nGoodbye! 👋\n");
      Deno.exit(0);
    });

    await runAgentInTerminal(agent);
  } catch (error) {
    console.error("Fatal Error:", formatError(error));
    Deno.exit(1);
  }
}
