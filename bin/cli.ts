import "@std/dotenv/load";
import {
  formatError,
  McpServerManager,
  runAgentInTerminal,
  ZypherAgent,
} from "@zypher/mod.ts";
import {
  CopyFileTool,
  defineImageTools,
  DeleteFileTool,
  EditFileTool,
  FileSearchTool,
  GrepSearchTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
} from "@zypher/tools/mod.ts";
import { parseArgs } from "@std/cli";
import chalk from "chalk";
import { AnthropicModelProvider } from "@zypher/llm/mod.ts";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

interface CliOptions {
  workspace?: string;
  userId?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

// Parse command line arguments using std/cli
const cliFlags = parseArgs(Deno.args, {
  string: ["workspace", "user-id", "base-url", "api-key", "model"],
  alias: {
    w: "workspace",
    u: "user-id",
    b: "base-url",
    k: "api-key",
  },
});

// Convert kebab-case args to camelCase for consistency
const options: CliOptions = {
  workspace: cliFlags.workspace,
  userId: cliFlags["user-id"],
  baseUrl: cliFlags["base-url"],
  apiKey: cliFlags["api-key"],
  model: cliFlags.model,
};

const mcpServerManager = new McpServerManager();

async function main(): Promise<void> {
  await mcpServerManager.init();

  try {
    // Handle workspace option
    if (options.workspace) {
      try {
        Deno.chdir(options.workspace);
        console.log(`🚀 Changed working directory to: ${Deno.cwd()}`);
      } catch (error) {
        throw new Error(
          `Failed to change to workspace directory: ${formatError(error)}`,
        );
      }
    }

    // Log CLI configuration
    if (options.userId) {
      console.log(`👤 Using custom user ID: ${options.userId}`);
    }

    if (options.baseUrl) {
      console.log(`🌐 Using custom API base URL: ${options.baseUrl}`);
    }

    if (options.apiKey) {
      console.log(`🔑 Using custom API key: ${chalk.gray("***")}`);
    }

    if (options.model) {
      console.log(`🧠 Using custom model: ${chalk.cyan(options.model)}`);
    }

    // Initialize the agent with provided options
    const agent = new ZypherAgent(
      new AnthropicModelProvider(options.apiKey ?? "", true),
      {
        userId: options.userId,
      },
      mcpServerManager,
    );

    // Register all available tools
    mcpServerManager.registerTool(ReadFileTool);
    mcpServerManager.registerTool(ListDirTool);
    mcpServerManager.registerTool(EditFileTool);
    mcpServerManager.registerTool(RunTerminalCmdTool);
    mcpServerManager.registerTool(GrepSearchTool);
    mcpServerManager.registerTool(FileSearchTool);
    mcpServerManager.registerTool(CopyFileTool);
    mcpServerManager.registerTool(DeleteFileTool);

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (openaiApiKey) {
      const { ImageGenTool, ImageEditTool } = defineImageTools(openaiApiKey);
      mcpServerManager.registerTool(ImageGenTool);
      mcpServerManager.registerTool(ImageEditTool);
    }

    console.log(
      "🔧 Registered tools:",
      Array.from(mcpServerManager.getAllTools().keys()).join(", "),
    );

    // Initialize the agent
    await agent.init();

    await runAgentInTerminal(agent, options.model ?? DEFAULT_MODEL);
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
