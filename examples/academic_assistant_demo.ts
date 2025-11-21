#!/usr/bin/env -S deno run -A

/**
 * Academic Research Assistant Demo
 *
 * This demo shows how to use Zypher Agent to create an academic research assistant
 * that can search for papers on arXiv and analyze research trends.
 *
 * Usage:
 *   1. Set ANTHROPIC_API_KEY environment variable
 *   2. Run: deno run -A examples/academic_assistant_demo.ts
 */

import "@std/dotenv/load";
import {
  AnthropicModelProvider,
  createZypherContext,
  formatError,
  ZypherAgent,
} from "@zypher/mod.ts";
import { ArXivSearchTool } from "@zypher/tools/mod.ts";
import chalk from "chalk";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

async function main() {
  console.log(chalk.cyan("\n🎓 Academic Research Assistant Demo\n"));

  // Check for API key
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error(chalk.red("❌ Error: ANTHROPIC_API_KEY environment variable not set"));
    console.log(chalk.yellow("\nPlease set your API key:"));
    console.log(chalk.gray("  export ANTHROPIC_API_KEY='your-api-key-here'"));
    Deno.exit(1);
  }

  try {
    // Initialize context and provider
    console.log(chalk.blue("🔧 Initializing agent...\n"));

    const workingDirectory = Deno.cwd();
    const context = await createZypherContext(workingDirectory);

    const provider = new AnthropicModelProvider({
      apiKey,
    });

    // Create agent
    const agent = new ZypherAgent(context, provider);

    // Register ArXiv search tool
    agent.mcp.registerTool(ArXivSearchTool);

    console.log(chalk.green("✓ Agent initialized"));
    console.log(chalk.green("✓ ArXiv search tool registered\n"));

    // Example research query
    const researchTopic = "large language models";
    console.log(chalk.magenta(`📚 Research Topic: "${researchTopic}"\n`));
    console.log(chalk.gray("─".repeat(60)));
    console.log();

    // Create task description
    const taskDescription = `
Please search for recent academic papers about "${researchTopic}" on arXiv.
Search for up to 5 papers and provide a brief summary of the search results.
Focus on the most recent papers (sort by date).

After searching, please:
1. List the papers you found with their titles and publication dates
2. Summarize the key themes and trends from the abstracts
3. Highlight any particularly interesting or significant papers
`.trim();

    // Run the task
    const taskEvents = agent.runTask(
      taskDescription,
      DEFAULT_MODEL,
    );

    // Process events
    let currentToolName = "";

    for await (const event of taskEvents) {
      switch (event.type) {
        case "text":
          // Stream text output
          process.stdout.write(event.content);
          break;

        case "tool_use":
          currentToolName = event.toolName;
          console.log(chalk.yellow(`\n\n🔍 Using tool: ${event.toolName}`));
          break;

        case "tool_use_approved":
          console.log(chalk.green(`✓ Tool approved: ${event.toolName}\n`));
          break;

        case "message":
          // Message complete, do nothing (we already streamed the text)
          break;

        case "cancelled":
          console.log(chalk.red(`\n\n❌ Task cancelled: ${event.reason}`));
          break;
      }
    }

    console.log(chalk.gray("\n\n" + "─".repeat(60)));
    console.log(chalk.green("\n✅ Task completed successfully!\n"));

  } catch (error) {
    console.error(chalk.red("\n❌ Error:"), formatError(error));
    Deno.exit(1);
  }
}

// Handle Ctrl+C
Deno.addSignalListener("SIGINT", () => {
  console.log(chalk.yellow("\n\n👋 Interrupted by user\n"));
  Deno.exit(0);
});

// Run the demo
if (import.meta.main) {
  main().catch((error) => {
    console.error(chalk.red("Fatal error:"), formatError(error));
    Deno.exit(1);
  });
}
