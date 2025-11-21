#!/usr/bin/env -S deno run -A

/**
 * Research Subscription System Demo
 *
 * This demo shows how to create a comprehensive research subscription system that:
 * 1. Searches multiple academic databases (arXiv, PubMed, Semantic Scholar)
 * 2. Tracks specific authors and research topics
 * 3. Sends personalized email updates
 * 4. Manages subscriptions with Deno KV
 *
 * Usage:
 *   1. Set environment variables:
 *      - ANTHROPIC_API_KEY
 *      - RESEND_API_KEY
 *      - FROM_EMAIL
 *   2. Run: deno run -A examples/research_subscription_demo.ts
 */

import "@std/dotenv/load";
import {
  AnthropicModelProvider,
  createZypherContext,
  formatError,
  ZypherAgent,
} from "@zypher/mod.ts";
import {
  ArXivSearchTool,
  PubMedSearchTool,
  SemanticScholarSearchTool,
  SendEmailTool,
  SubscriptionManager,
  TrackAuthorTool,
} from "@zypher/tools/mod.ts";
import chalk from "chalk";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/**
 * Main demo function
 */
async function main() {
  console.log(chalk.cyan("\n🎓 Research Subscription System Demo\n"));

  // Check environment variables
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL");

  if (!anthropicKey) {
    console.error(
      chalk.red("❌ Error: ANTHROPIC_API_KEY environment variable not set"),
    );
    Deno.exit(1);
  }

  if (!resendKey) {
    console.log(
      chalk.yellow(
        "⚠️  Warning: RESEND_API_KEY not set. Email functionality will be disabled.",
      ),
    );
  }

  if (!fromEmail) {
    console.log(
      chalk.yellow(
        "⚠️  Warning: FROM_EMAIL not set. Using default: research@example.com",
      ),
    );
  }

  try {
    // Initialize subscription manager
    console.log(chalk.blue("🔧 Initializing subscription manager...\n"));
    const subscriptionManager = await SubscriptionManager.create();

    // Initialize agent
    const workingDirectory = Deno.cwd();
    const context = await createZypherContext(workingDirectory);
    const provider = new AnthropicModelProvider({ apiKey: anthropicKey });
    const agent = new ZypherAgent(context, provider);

    // Register all research tools
    agent.mcp.registerTool(ArXivSearchTool);
    agent.mcp.registerTool(PubMedSearchTool);
    agent.mcp.registerTool(SemanticScholarSearchTool);
    agent.mcp.registerTool(TrackAuthorTool);

    if (resendKey && fromEmail) {
      agent.mcp.registerTool(SendEmailTool);
    }

    console.log(chalk.green("✓ Agent initialized"));
    console.log(chalk.green("✓ All research tools registered\n"));

    // Demo 1: Search across multiple databases
    console.log(chalk.magenta("=" .repeat(60)));
    console.log(chalk.magenta("📊 Demo 1: Multi-Database Search"));
    console.log(chalk.magenta("=" .repeat(60)));
    console.log();

    const searchTask = `
Search for recent papers on "CRISPR gene editing" across different databases:
1. Search arXiv for 3 papers
2. Search PubMed for 3 papers
3. Search Semantic Scholar for 3 papers

After searching, please compare and summarize:
- Which database has the most recent papers on this topic?
- What are the main research trends you observe?
- Are there any overlapping papers across databases?
    `.trim();

    console.log(chalk.gray("Task: Multi-database search and comparison\n"));

    const searchEvents = agent.runTask(searchTask, DEFAULT_MODEL);

    for await (const event of searchEvents) {
      if (event.type === "text") {
        process.stdout.write(event.content);
      } else if (event.type === "tool_use") {
        console.log(chalk.yellow(`\n\n🔍 Using: ${event.toolName}`));
      }
    }

    console.log(chalk.gray("\n\n" + "─".repeat(60)));

    // Demo 2: Track a specific researcher
    console.log(chalk.magenta("\n\n📊 Demo 2: Author Tracking"));
    console.log(chalk.magenta("=" .repeat(60)));
    console.log();

    const authorTask = `
Track recent papers by "Andrew Ng" (or another prominent AI researcher).
Please:
1. Find their recent publications
2. Summarize their current research focus
3. Identify their most cited recent papers
    `.trim();

    console.log(chalk.gray("Task: Track researcher publications\n"));

    const authorEvents = agent.runTask(authorTask, DEFAULT_MODEL);

    for await (const event of authorEvents) {
      if (event.type === "text") {
        process.stdout.write(event.content);
      } else if (event.type === "tool_use") {
        console.log(chalk.yellow(`\n\n🔍 Using: ${event.toolName}`));
      }
    }

    console.log(chalk.gray("\n\n" + "─".repeat(60)));

    // Demo 3: Create subscriptions
    console.log(chalk.magenta("\n\n📊 Demo 3: Subscription Management"));
    console.log(chalk.magenta("=" .repeat(60)));
    console.log();

    // Create sample subscriptions
    const subscription1 = await subscriptionManager.addSubscription({
      type: "topic",
      query: "quantum computing",
      email: "researcher@example.com",
      dataSources: ["arxiv", "semantic_scholar"],
      frequency: "weekly",
      maxResults: 10,
      active: true,
    });

    console.log(chalk.green("✓ Created subscription 1:"));
    console.log(
      chalk.gray(`  Topic: ${subscription1.query}`),
    );
    console.log(
      chalk.gray(`  Email: ${subscription1.email}`),
    );
    console.log(
      chalk.gray(`  Frequency: ${subscription1.frequency}`),
    );
    console.log();

    const subscription2 = await subscriptionManager.addSubscription({
      type: "author",
      query: "Yoshua Bengio",
      email: "researcher@example.com",
      dataSources: ["semantic_scholar"],
      frequency: "monthly",
      maxResults: 5,
      active: true,
    });

    console.log(chalk.green("✓ Created subscription 2:"));
    console.log(
      chalk.gray(`  Author: ${subscription2.query}`),
    );
    console.log(
      chalk.gray(`  Email: ${subscription2.email}`),
    );
    console.log(
      chalk.gray(`  Frequency: ${subscription2.frequency}`),
    );
    console.log();

    // Show statistics
    const stats = await subscriptionManager.getStatistics();
    console.log(chalk.cyan("📈 Subscription Statistics:"));
    console.log(chalk.gray(`  Total: ${stats.total}`));
    console.log(chalk.gray(`  Active: ${stats.active}`));
    console.log(
      chalk.gray(
        `  By Type: Topic(${stats.byType.topic}), Author(${stats.byType.author}), Keyword(${stats.byType.keyword})`,
      ),
    );
    console.log(
      chalk.gray(
        `  By Frequency: Daily(${stats.byFrequency.daily}), Weekly(${stats.byFrequency.weekly}), Monthly(${stats.byFrequency.monthly})`,
      ),
    );

    console.log(chalk.gray("\n\n" + "─".repeat(60)));

    // Demo 4: Generate and send email (if configured)
    if (resendKey && fromEmail) {
      console.log(chalk.magenta("\n\n📊 Demo 4: Email Report Generation"));
      console.log(chalk.magenta("=" .repeat(60)));
      console.log();

      const emailTask = `
Search for 3 recent papers on "machine learning" on arXiv.
Then, send an email to "test@example.com" with the subject "Weekly ML Research Update".

The email should include:
- A brief introduction
- List of the 3 papers with titles, authors, and brief summaries
- Key trends you observe

Use the send_email tool to send the email.
      `.trim();

      console.log(chalk.gray("Task: Generate and send email report\n"));

      const emailEvents = agent.runTask(emailTask, DEFAULT_MODEL);

      for await (const event of emailEvents) {
        if (event.type === "text") {
          process.stdout.write(event.content);
        } else if (event.type === "tool_use") {
          console.log(chalk.yellow(`\n\n🔍 Using: ${event.toolName}`));
        }
      }

      console.log(chalk.gray("\n\n" + "─".repeat(60)));
    }

    // Cleanup
    subscriptionManager.close();

    console.log(chalk.green("\n\n✅ Demo completed successfully!\n"));
    console.log(chalk.cyan("💡 Next Steps:"));
    console.log(
      chalk.gray(
        "  1. Set up automated task scheduling (cron, GitHub Actions, etc.)",
      ),
    );
    console.log(
      chalk.gray("  2. Create a web interface for subscription management"),
    );
    console.log(
      chalk.gray("  3. Add more data sources and filtering options"),
    );
    console.log(
      chalk.gray("  4. Implement user authentication and preferences"),
    );
    console.log();
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
