import "@std/dotenv/load";
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
import { formatError } from "@zypher/utils/error";
import chalk from "chalk";
import { runAgentInTerminal } from "./run_agent_in_terminal.ts";

export async function main(): Promise<void> {
  // Parse command line arguments using Cliffy
  const { options: cli } = await new Command()
    .name("zypher")
    .description("Zypher Agent CLI")
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
    .option(
      "--skills-dir <skillsDir:string>",
      "Additional custom skills directory (can be specified multiple times)",
      { collect: true },
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

    // Model string with auto-inferred provider
    const modelString = cli.model ?? DEFAULT_MODELS.openai;

    // Initialize the model provider
    const modelProvider = createModelProvider(modelString, {
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
      model: modelProvider,
      workingDirectory: cli.workDir,
      tools,
      context: { userId: cli.userId },
      config: {
        skills: cli.skillsDir?.length
          ? { customSkillsDirs: cli.skillsDir }
          : undefined,
      },
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
