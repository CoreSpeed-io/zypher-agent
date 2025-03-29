import { ZypherAgent } from "../src/ZypherAgent";
import type { StreamHandler } from "../src/ZypherAgent";
import {
  ReadFileTool,
  ListDirTool,
  EditFileTool,
  RunTerminalCmdTool,
  GrepSearchTool,
  FileSearchTool,
  DeleteFileTool,
  ImageGenTool,
} from "../src/tools";
import { Command } from "commander";
import dotenv from "dotenv";
import readline from "readline";
import { stdin as input, stdout as output } from "process";
import { formatError } from "../src/utils/error";
import chalk from "chalk";

interface CliOptions {
  workspace?: string;
  userId?: string;
  baseUrl?: string;
  apiKey?: string;
  noStreamingOutput?: boolean;
}

const program = new Command();

program
  .name("zypher")
  .description("AI-powered coding assistant")
  .version("0.1.0")
  .option("-w, --workspace <path>", "Set working directory for the agent")
  .option(
    "-u, --user-id <string>",
    "Set the user identifier (overrides ZYPHER_USER_ID env variable)",
  )
  .option(
    "-b, --base-url <string>",
    "Set the Anthropic API base URL (overrides ANTHROPIC_BASE_URL env variable)",
  )
  .option(
    "-k, --api-key <string>",
    "Set the Anthropic API key (overrides ANTHROPIC_API_KEY env variable)",
  )
  .option("--no-streaming", "Disable streaming output in the terminal")
  .parse(process.argv);

const options = program.opts<CliOptions>();

const rl = readline.createInterface({ input, output });

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  dotenv.config();

  try {
    // Handle workspace option
    if (options.workspace) {
      try {
        process.chdir(options.workspace);
        console.log(`🚀 Changed working directory to: ${process.cwd()}`);
      } catch (error) {
        throw new Error(
          `Failed to change to workspace directory: ${formatError(error)}`,
        );
      }
    }

    // Initialize the agent with provided options
    const agent = new ZypherAgent({
      userId: options.userId,
      baseUrl: options.baseUrl,
      anthropicApiKey: options.apiKey,
    });

    // Register all available tools
    agent.registerTool(ReadFileTool);
    agent.registerTool(ListDirTool);
    agent.registerTool(EditFileTool);
    agent.registerTool(RunTerminalCmdTool);
    agent.registerTool(GrepSearchTool);
    agent.registerTool(FileSearchTool);
    agent.registerTool(DeleteFileTool);
    agent.registerTool(ImageGenTool);

    console.log(
      "🔧 Registered tools:",
      Array.from(agent.tools.keys()).join(", "),
    );

    // Initialize the agent
    await agent.init();

    console.log("\n🤖 Welcome to Zypher Agent CLI!\n");
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
          if (options.noStreamingOutput) {
            // Use the non-streaming approach if streaming is disabled
            await agent.runTaskLoop(task);
          } else {
            // Setup streaming handlers
            const streamHandler: StreamHandler = {
              onContent: (content, isFirstChunk) => {
                // For the first content chunk, add a bot indicator
                if (isFirstChunk) {
                  process.stdout.write(chalk.blue("🤖 "));
                }

                // Write the text without newline to allow continuous streaming
                process.stdout.write(content);
              },
              onMessage: (message) => {
                // Add a separator between messages for better readability
                if (message.role === "assistant") {
                  process.stdout.write("\n");

                  // Check if the message contains tool use
                  const content = Array.isArray(message.content)
                    ? message.content
                    : [];
                  for (const block of content) {
                    if (block.type === "tool_use") {
                      process.stdout.write(
                        chalk.yellow("\n\n🛠️ Using tool: ") +
                          chalk.green(block.name) +
                          "\n",
                      );
                      break;
                    }
                  }
                }
              },
            };

            await agent.runTaskWithStreaming(task, streamHandler);

            // Add extra newlines for readability after completion
            process.stdout.write("\n\n");
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
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log("\n\nGoodbye! 👋\n");
  process.exit(0);
});

// Run the CLI
main().catch((error) => {
  console.error("Unhandled error:", formatError(error));
  process.exit(1);
});
