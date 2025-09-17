import "@std/dotenv/load";
import { formatError, runAgentInTerminal, ZypherAgent } from "@zypher/mod.ts";
import {
  CopyFileTool,
  defineEditFileTool,
  defineImageTools,
  DeleteFileTool,
  FileSearchTool,
  GrepSearchTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
} from "@zypher/tools/mod.ts";
import { Command, EnumType } from "@cliffy/command";
import chalk from "chalk";
import {
  AnthropicModelProvider,
  OpenAIModelProvider,
} from "@zypher/llm/mod.ts";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OPENAI_MODEL = "gpt-4o-2024-11-20";
const DEFAULT_BACKUP_DIR = "./.backup";

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
    "Working directory override for tools/checkpoints (no chdir)",
  )
  .option("-u, --user-id <userId:string>", "Custom user ID")
  .option(
    "--openai-api-key <openaiApiKey:string>",
    "OpenAI API key for image tools when provider=anthropic (ignored if provider=openai)",
  )
  .option("--backup-dir <backupDir:string>", "Directory to store backups")
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

    const agent = new ZypherAgent(
      providerInstance,
      {
        userId: cli.userId,
        workingDirectory: cli.workDir,
      },
    );

    const mcpServerManager = agent.mcpServerManager;

    // Register all available tools
    mcpServerManager.registerTool(ReadFileTool);
    mcpServerManager.registerTool(ListDirTool);
    mcpServerManager.registerTool(RunTerminalCmdTool);
    mcpServerManager.registerTool(GrepSearchTool);
    mcpServerManager.registerTool(FileSearchTool);
    mcpServerManager.registerTool(CopyFileTool);
    mcpServerManager.registerTool(DeleteFileTool);

    // Image tools are powered by OpenAI only
    const openaiApiKey = cli.provider === "openai"
      ? cli.apiKey
      : cli.openaiApiKey;

    if (openaiApiKey) {
      const { ImageGenTool, ImageEditTool } = defineImageTools(openaiApiKey);
      mcpServerManager.registerTool(ImageGenTool);
      mcpServerManager.registerTool(ImageEditTool);
    }

    const backupDir = cli.backupDir ?? DEFAULT_BACKUP_DIR;
    const { EditFileTool } = defineEditFileTool(backupDir);
    mcpServerManager.registerTool(EditFileTool);

    console.log(
      "🔧 Registered tools:",
      Array.from(mcpServerManager.getAllTools().keys()).join(", "),
    );

    // Initialize the agent
    await agent.init();

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
