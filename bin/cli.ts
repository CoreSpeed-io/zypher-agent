// The jsr specifier here is a workaround for deno rolldown plugin
import "jsr:@std/dotenv/load";
import { type StreamHandler, ZypherAgent } from "../src/ZypherAgent.ts";
import {
  DeleteFileTool,
  EditFileTool,
  FileSearchTool,
  GrepSearchTool,
  ImageEditTool,
  ImageGenTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
} from "../src/tools/mod.ts";
import { parseArgs } from "@std/cli";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { formatError } from "../src/error.ts";
import chalk from "chalk";
import { McpServerManager } from "../src/mcp/McpServerManager.ts";
import { printMessage } from "../src/message.ts";

interface CliOptions {
  workspace?: string;
  userId?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

// Parse command line arguments using std/cli
const cliFlags = parseArgs(Deno.args, {
  string: ["workspace", "user-id", "base-url", "api-key"],
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
};

const rl = readline.createInterface({ input, output });
const textEncoder = new TextEncoder();

const mcpServerManager = new McpServerManager();

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

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
      {
        userId: options.userId,
        baseUrl: options.baseUrl,
        anthropicApiKey: options.apiKey,
        model: options.model,
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
    mcpServerManager.registerTool(DeleteFileTool);
    mcpServerManager.registerTool(ImageGenTool);
    mcpServerManager.registerTool(ImageEditTool);

    console.log(
      "🔧 Registered tools:",
      Array.from(mcpServerManager.getAllTools().keys()).join(", "),
    );

    // Initialize the agent
    await agent.init();

    console.log("\n🤖 Welcome to Zypher Agent CLI!\n");
    if (!options.model) {
      console.log(`🧠 Using model: ${chalk.cyan(agent.model)}`);
    }
    console.log(
      'Type your task or command below. Use "exit" or Ctrl+C to quit.\n',
    );

    while (true) {
      const task = await prompt("🔧 Enter your task: ");

      if (task.toLowerCase() === "exit") {
        console.log("\nGoodbye! 👋\n");
        break;
      }

      let isFirstToolUseChunk = true;

      if (task.trim()) {
        console.log("\n🚀 Starting task execution...\n");
        try {
          // Setup streaming handlers
          const streamHandler: StreamHandler = {
            onContent: (content, isFirstChunk) => {
              // For the first content chunk, add a bot indicator
              if (isFirstChunk) {
                Deno.stdout.write(
                  textEncoder.encode(chalk.blue("🤖 ")),
                );
              }

              // Write the text without newline to allow continuous streaming
              Deno.stdout.write(textEncoder.encode(content));
            },
            onToolUse: (name, partialInput) => {
              if (isFirstToolUseChunk) {
                Deno.stdout.write(
                  textEncoder.encode(`\n\n🔧 Using tool: ${name}\n`),
                );
              }
              isFirstToolUseChunk = false;

              Deno.stdout.write(
                textEncoder.encode(partialInput),
              );
            },
            onMessage: (message) => {
              // Add a line between messages for better readability
              Deno.stdout.write(textEncoder.encode("\n"));

              if (message.role === "user") {
                printMessage(message);
                Deno.stdout.write(textEncoder.encode("\n"));
              }
            },
          };

          await agent.runTaskWithStreaming(task, streamHandler);

          // Add extra newlines for readability after completion
          Deno.stdout.write(textEncoder.encode("\n\n"));

          console.log("\n✅ Task completed.\n");
        } catch (error) {
          console.error(chalk.red("\n❌ Error:"), formatError(error));
          console.log("\nReady for next task.\n");
        }
      }
    }
  } catch (error) {
    console.error("Fatal Error:", formatError(error));
    Deno.exit(1);
  } finally {
    rl.close();
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
