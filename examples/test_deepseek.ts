#!/usr/bin/env -S deno run -A

/**
 * DeepSeek API Test
 *
 * This script tests the Zypher Agent with DeepSeek API.
 * DeepSeek provides OpenAI-compatible API, so we use OpenAIModelProvider.
 *
 * Usage:
 *   deno run -A examples/test_deepseek.ts
 */

import {
  createZypherContext,
  OpenAIModelProvider,
  ZypherAgent,
} from "@zypher/mod.ts";
import { ReadFileTool } from "@zypher/tools/mod.ts";
import chalk from "chalk";

// DeepSeek API Configuration
const DEEPSEEK_API_KEY = "sk-50ef015b4dbe4bb893c19e0b70c4cc9a";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-chat";

async function testDeepSeekBasic() {
  console.log(chalk.cyan("\n🧪 Testing DeepSeek API - Basic Chat\n"));

  try {
    // Create OpenAI-compatible provider with DeepSeek configuration
    const provider = new OpenAIModelProvider({
      apiKey: DEEPSEEK_API_KEY,
      baseUrl: DEEPSEEK_BASE_URL,
    });

    console.log(chalk.blue("✓ Provider initialized with DeepSeek configuration"));
    console.log(chalk.gray(`  Base URL: ${DEEPSEEK_BASE_URL}`));
    console.log(chalk.gray(`  Model: ${DEEPSEEK_MODEL}\n`));

    // Create context
    const context = await createZypherContext(Deno.cwd());

    // Create agent
    const agent = new ZypherAgent(context, provider);

    console.log(chalk.blue("✓ Agent created successfully\n"));

    // Simple test task
    const testTask = "请用中文回答：什么是人工智能？请用2-3句话简要说明。";

    console.log(chalk.magenta("📝 Test Task:"));
    console.log(chalk.gray(`   ${testTask}\n`));

    console.log(chalk.yellow("🤖 DeepSeek Response:\n"));
    console.log(chalk.gray("─".repeat(60)));
    console.log();

    // Run task
    const events = agent.runTask(testTask, DEEPSEEK_MODEL);

    let responseText = "";
    for await (const event of events) {
      if (event.type === "text") {
        responseText += event.content;
        process.stdout.write(chalk.white(event.content));
      } else if (event.type === "cancelled") {
        console.log(chalk.red(`\n\n❌ Task cancelled: ${event.reason}`));
        return false;
      }
    }

    console.log();
    console.log(chalk.gray("─".repeat(60)));

    if (responseText.length > 0) {
      console.log(chalk.green("\n✅ DeepSeek API Test PASSED!"));
      console.log(chalk.gray(`   Response length: ${responseText.length} characters`));
      return true;
    } else {
      console.log(chalk.red("\n❌ DeepSeek API Test FAILED: Empty response"));
      return false;
    }
  } catch (error) {
    console.error(chalk.red("\n❌ Error:"), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    return false;
  }
}

async function testDeepSeekWithTools() {
  console.log(chalk.cyan("\n🧪 Testing DeepSeek API - With Tools\n"));

  try {
    const provider = new OpenAIModelProvider({
      apiKey: DEEPSEEK_API_KEY,
      baseUrl: DEEPSEEK_BASE_URL,
    });

    const context = await createZypherContext(Deno.cwd());
    const agent = new ZypherAgent(context, provider);

    // Register a simple tool
    agent.mcp.registerTool(ReadFileTool);

    console.log(chalk.blue("✓ Tool registered: ReadFileTool\n"));

    const testTask = "请读取当前目录下的 README.md 文件，并告诉我这个项目的主要功能是什么？用中文回答，简洁明了。";

    console.log(chalk.magenta("📝 Test Task (with tool):"));
    console.log(chalk.gray(`   ${testTask}\n`));

    console.log(chalk.yellow("🤖 DeepSeek Response:\n"));
    console.log(chalk.gray("─".repeat(60)));
    console.log();

    const events = agent.runTask(testTask, DEEPSEEK_MODEL);

    let responseText = "";
    let toolsUsed = 0;

    for await (const event of events) {
      if (event.type === "text") {
        responseText += event.content;
        process.stdout.write(chalk.white(event.content));
      } else if (event.type === "tool_use") {
        toolsUsed++;
        console.log(chalk.yellow(`\n\n🔧 Using tool: ${event.toolName}\n`));
      } else if (event.type === "cancelled") {
        console.log(chalk.red(`\n\n❌ Task cancelled: ${event.reason}`));
        return false;
      }
    }

    console.log();
    console.log(chalk.gray("─".repeat(60)));

    if (responseText.length > 0) {
      console.log(chalk.green("\n✅ DeepSeek Tool Test PASSED!"));
      console.log(chalk.gray(`   Tools used: ${toolsUsed}`));
      console.log(chalk.gray(`   Response length: ${responseText.length} characters`));
      return true;
    } else {
      console.log(chalk.red("\n❌ DeepSeek Tool Test FAILED: Empty response"));
      return false;
    }
  } catch (error) {
    console.error(chalk.red("\n❌ Error:"), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    return false;
  }
}

async function main() {
  console.log(chalk.cyan("╔═══════════════════════════════════════════════════╗"));
  console.log(chalk.cyan("║                                                   ║"));
  console.log(chalk.cyan("║         DeepSeek API Integration Test             ║"));
  console.log(chalk.cyan("║                                                   ║"));
  console.log(chalk.cyan("╚═══════════════════════════════════════════════════╝"));

  // Test 1: Basic chat
  const test1 = await testDeepSeekBasic();

  // Test 2: With tools
  const test2 = await testDeepSeekWithTools();

  // Summary
  console.log(chalk.cyan("\n" + "═".repeat(60)));
  console.log(chalk.cyan("\n📊 Test Summary:\n"));

  if (test1) {
    console.log(chalk.green("  ✅ Basic Chat Test: PASSED"));
  } else {
    console.log(chalk.red("  ❌ Basic Chat Test: FAILED"));
  }

  if (test2) {
    console.log(chalk.green("  ✅ Tool Integration Test: PASSED"));
  } else {
    console.log(chalk.red("  ❌ Tool Integration Test: FAILED"));
  }

  console.log(chalk.cyan("\n" + "═".repeat(60)));

  if (test1 && test2) {
    console.log(chalk.green("\n🎉 All tests PASSED! DeepSeek integration is working!\n"));
  } else {
    console.log(chalk.red("\n⚠️  Some tests FAILED. Please check the errors above.\n"));
  }
}

// Handle Ctrl+C
Deno.addSignalListener("SIGINT", () => {
  console.log(chalk.yellow("\n\n👋 Test interrupted by user\n"));
  Deno.exit(0);
});

// Run tests
if (import.meta.main) {
  main().catch((error) => {
    console.error(chalk.red("Fatal error:"), error);
    Deno.exit(1);
  });
}
