#!/usr/bin/env -S deno run -A

/**
 * Automated Research Digest Sender
 *
 * This script checks for subscriptions that are due to be sent,
 * searches for new papers, and sends personalized email digests.
 *
 * Run this script on a schedule (e.g., cron, GitHub Actions) to automate
 * research update emails.
 *
 * Usage:
 *   deno run -A examples/automated_research_digest.ts
 *
 * Or add to crontab:
 *   0 9 * * * cd /path/to/project && deno run -A examples/automated_research_digest.ts
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
import type { Subscription } from "@zypher/tools/mod.ts";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/**
 * Process a single subscription
 */
async function processSubscription(
  agent: ZypherAgent,
  subscription: Subscription,
  subscriptionManager: SubscriptionManager,
): Promise<void> {
  console.log(`\n📧 Processing subscription: ${subscription.id}`);
  console.log(`   Type: ${subscription.type}`);
  console.log(`   Query: ${subscription.query}`);
  console.log(`   Email: ${subscription.email}`);

  try {
    // Build task description based on subscription type
    let taskDescription = "";

    if (subscription.type === "author") {
      taskDescription = `
Track recent papers by "${subscription.query}".
Search for up to ${subscription.maxResults} recent publications.

Then, send an email to "${subscription.email}" with:
- Subject: "Research Update: New papers by ${subscription.query}"
- A personalized greeting
- List of papers with titles, authors, publication dates, and brief summaries
- Any notable trends or highlights

Use the send_email tool to send the email.
      `.trim();
    } else if (subscription.type === "topic") {
      // Build data source specific searches
      const searches: string[] = [];

      if (
        subscription.dataSources.includes("arxiv") ||
        subscription.dataSources.includes("all")
      ) {
        searches.push(
          `Search arXiv for ${
            Math.ceil(subscription.maxResults / subscription.dataSources.length)
          } papers`,
        );
      }

      if (
        subscription.dataSources.includes("pubmed") ||
        subscription.dataSources.includes("all")
      ) {
        searches.push(
          `Search PubMed for ${
            Math.ceil(subscription.maxResults / subscription.dataSources.length)
          } papers`,
        );
      }

      if (
        subscription.dataSources.includes("semantic_scholar") ||
        subscription.dataSources.includes("all")
      ) {
        searches.push(
          `Search Semantic Scholar for ${
            Math.ceil(subscription.maxResults / subscription.dataSources.length)
          } papers`,
        );
      }

      taskDescription = `
Search for recent papers on "${subscription.query}":
${searches.map((s, i) => `${i + 1}. ${s}`).join("\n")}

After searching, send an email to "${subscription.email}" with:
- Subject: "Research Digest: ${subscription.query}"
- A personalized greeting
- Summary of key themes and trends
- List of the most interesting papers with titles, authors, and summaries
- Relevant links

Use the send_email tool to send the email.
      `.trim();
    }

    // Run the task
    const events = agent.runTask(taskDescription, DEFAULT_MODEL);

    let toolsUsed = 0;
    for await (const event of events) {
      if (event.type === "tool_use") {
        toolsUsed++;
        console.log(`   🔧 Using tool: ${event.toolName}`);
      }
    }

    // Mark as sent
    await subscriptionManager.markSubscriptionSent(subscription.id);
    console.log(`   ✅ Subscription processed successfully (${toolsUsed} tools used)`);
  } catch (error) {
    console.error(`   ❌ Error processing subscription:`, formatError(error));
  }
}

/**
 * Main function
 */
async function main() {
  console.log("🤖 Starting automated research digest sender...\n");

  // Check environment variables
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL");

  if (!anthropicKey) {
    console.error("❌ Error: ANTHROPIC_API_KEY not set");
    Deno.exit(1);
  }

  if (!resendKey || !fromEmail) {
    console.error(
      "❌ Error: RESEND_API_KEY and FROM_EMAIL must be set for email functionality",
    );
    Deno.exit(1);
  }

  try {
    // Initialize subscription manager
    console.log("📂 Loading subscriptions...");
    const subscriptionManager = await SubscriptionManager.create();

    // Get subscriptions due for sending
    const dueSubscriptions = await subscriptionManager
      .getSubscriptionsDueForSending();

    console.log(`📊 Found ${dueSubscriptions.length} subscriptions to process\n`);

    if (dueSubscriptions.length === 0) {
      console.log("✨ No subscriptions due. Exiting.");
      subscriptionManager.close();
      return;
    }

    // Initialize agent
    console.log("🔧 Initializing agent...");
    const workingDirectory = Deno.cwd();
    const context = await createZypherContext(workingDirectory);
    const provider = new AnthropicModelProvider({ apiKey: anthropicKey });
    const agent = new ZypherAgent(context, provider);

    // Register tools
    agent.mcp.registerTool(ArXivSearchTool);
    agent.mcp.registerTool(PubMedSearchTool);
    agent.mcp.registerTool(SemanticScholarSearchTool);
    agent.mcp.registerTool(TrackAuthorTool);
    agent.mcp.registerTool(SendEmailTool);

    console.log("✅ Agent ready\n");

    // Process each subscription
    for (const subscription of dueSubscriptions) {
      await processSubscription(agent, subscription, subscriptionManager);
    }

    // Cleanup
    subscriptionManager.close();

    console.log("\n✅ All subscriptions processed successfully!");
    console.log(
      `📧 Sent ${dueSubscriptions.length} research digest${
        dueSubscriptions.length > 1 ? "s" : ""
      }\n`,
    );
  } catch (error) {
    console.error("❌ Fatal error:", formatError(error));
    Deno.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", formatError(error));
    Deno.exit(1);
  });
}
