import type { ZypherAgent } from "@zypher/agent";
import readline from "node:readline";
import { stdin, stdout } from "node:process";
import chalk from "chalk";
import { formatError, printMessage } from "@zypher/agent";
import { eachValueFrom } from "rxjs-for-await";

/**
 * Run the agent in a terminal interface.
 * @param agent - The agent to run.
 * @param model - The model to use.
 */
export async function runAgentInTerminal(
  agent: ZypherAgent,
  model: string,
): Promise<void> {
  console.log("\nWelcome to Zypher Agent CLI!\n");
  console.log(`Using model: ${chalk.cyan(model)}`);
  console.log(
    'Type your task or command below. Use "exit" or Ctrl+C to quit.\n',
  );

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const textEncoder = new TextEncoder();

  try {
    while (true) {
      const task = await prompt("Enter your task: ", rl);

      if (task.toLowerCase() === "exit") {
        console.log("\nGoodbye!\n");
        break;
      }

      if (!task.trim()) continue;

      console.log("\nStarting task execution...\n");
      try {
        const taskEvents = await agent.runTask(task, model);
        let isFirstTextChunk = true;
        let cancelled = false;

        for await (const event of eachValueFrom(taskEvents)) {
          if (event.type === "text") {
            if (isFirstTextChunk) {
              Deno.stdout.write(textEncoder.encode(chalk.blue("Agent: ")));
              isFirstTextChunk = false;
            }

            // Write the text without newline to allow continuous streaming
            Deno.stdout.write(textEncoder.encode(event.content));
          } else {
            isFirstTextChunk = true;
          }

          if (event.type === "message") {
            // Add a line between messages for better readability
            Deno.stdout.write(textEncoder.encode("\n"));

            if (event.message.role === "user") {
              printMessage(event.message);
              Deno.stdout.write(textEncoder.encode("\n"));
            }
          } else if (event.type === "tool_use") {
            Deno.stdout.write(
              textEncoder.encode(`\n\nUsing tool: ${event.toolName}\n`),
            );
          } else if (event.type === "tool_use_input") {
            Deno.stdout.write(textEncoder.encode(event.partialInput));
          } else if (event.type === "cancelled") {
            cancelled = true;
            console.log("\nTask cancelled, reason: ", event.reason, "\n");
          }
        }

        // Add extra newlines for readability after completion
        Deno.stdout.write(textEncoder.encode("\n\n"));

        if (!cancelled) {
          console.log("\nTask completed.\n");
        }
      } catch (error) {
        console.error(chalk.red("\nError:"), formatError(error));
        console.log("\nReady for next task.\n");
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
