import type { StreamHandler, ZypherAgent } from "./ZypherAgent.ts";
import readline from "node:readline";
import { stdin, stdout } from "node:process";
import chalk from "chalk";
import { printMessage } from "./message.ts";
import { formatError } from "./error.ts";

/**
 * Run the agent in a terminal interface.
 * @param agent - The agent to run.
 * @param model - The model to use. If not provided, the default model will be used.
 */
export async function runAgentInTerminal(agent: ZypherAgent, model?: string) {
  console.log("\n🤖 Welcome to Zypher Agent CLI!\n");

  if (model) {
    console.log(`🧠 Using model: ${chalk.cyan(model)}`);
  }

  console.log(
    'Type your task or command below. Use "exit" or Ctrl+C to quit.\n',
  );

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const textEncoder = new TextEncoder();

  try {
    while (true) {
      const task = await prompt("🔧 Enter your task: ", rl);

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

          await agent.runTaskWithStreaming(task, model, streamHandler);

          // Add extra newlines for readability after completion
          Deno.stdout.write(textEncoder.encode("\n\n"));

          console.log("\n✅ Task completed.\n");
        } catch (error) {
          console.error(chalk.red("\n❌ Error:"), formatError(error));
          console.log("\nReady for next task.\n");
        }
      }
    }
  } finally {
    rl.close();
  }
}

function prompt(question: string, rl: readline.Interface): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}
