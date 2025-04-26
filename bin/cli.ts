import "@std/dotenv/load";
import { ZypherAgent } from "../src/ZypherAgent.ts";
import type { StreamHandler } from "../src/ZypherAgent.ts";
import {
  DeleteFileTool,
  EditFileTool,
  FileSearchTool,
  GrepSearchTool,
  ImageGenTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
} from "../src/tools/index.ts";
import { parseArgs } from "@std/cli";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { formatError } from "../src/utils/error.ts";
import chalk from "chalk";
import { McpServerManager } from "../src/mcp/McpServerManager.ts";

interface CliOptions {
  workspace?: string;
  userId?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  streaming?: boolean;
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
      handleToolApproval,
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

      if (task.trim()) {
        console.log("\n🚀 Starting task execution...\n");
        try {
          if (!options.streaming) {
            // Use the non-streaming approach if streaming is disabled
            await agent.runTaskLoop(task);
          } else {
            // Setup streaming handlers
            const streamHandler: StreamHandler = {
              onContent: (content, isFirstChunk) => {
                // For the first content chunk, add a bot indicator
                if (isFirstChunk) {
                  Deno.stdout.write(
                    new TextEncoder().encode(chalk.blue("🤖 ")),
                  );
                }

                // Write the text without newline to allow continuous streaming
                Deno.stdout.write(new TextEncoder().encode(content));
              },
              onMessage: (message) => {
                // Add a separator between messages for better readability
                if (message.role === "assistant") {
                  Deno.stdout.write(new TextEncoder().encode("\n"));

                  // Check if the message contains tool use
                  const content = Array.isArray(message.content)
                    ? message.content
                    : [];
                  for (const block of content) {
                    if (block.type === "tool_use") {
                      Deno.stdout.write(
                        new TextEncoder().encode(
                          chalk.yellow("\n\n🛠️ Using tool: ") +
                            chalk.green(block.name) +
                            "\n" +
                            JSON.stringify(block.input, null, 2),
                        ),
                      );
                      break;
                    }
                  }
                }
              },
            };

            await agent.runTaskWithStreaming(task, streamHandler);

            // Add extra newlines for readability after completion
            Deno.stdout.write(new TextEncoder().encode("\n\n"));
          }

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

// Handle tool approval using the prompt helper
async function handleToolApproval(): Promise<boolean> {
  const answer = await prompt("Do you approve of this command? (y/n) ");
  return answer.toLowerCase().startsWith("y");
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
