#!/usr/bin/env -S deno run -A

/**
 * Test All Academic Data Sources
 *
 * This script tests all available academic research data sources:
 * - arXiv (physics, CS, math)
 * - PubMed (biomedical)
 * - Semantic Scholar (multi-disciplinary)
 * - CrossRef (cross-publisher)
 * - OpenAlex (comprehensive scholarly graph)
 *
 * Usage:
 *   deno run -A examples/test_all_data_sources.ts
 */

import "@std/dotenv/load";
import {
  createZypherContext,
  OpenAIModelProvider,
  ZypherAgent,
} from "@zypher/mod.ts";
import {
  ArXivSearchTool,
  CrossRefSearchTool,
  OpenAlexSearchTool,
  PubMedSearchTool,
  SemanticScholarSearchTool,
} from "@zypher/tools/mod.ts";
import chalk from "chalk";

// DeepSeek Configuration
const DEEPSEEK_API_KEY = "sk-50ef015b4dbe4bb893c19e0b70c4cc9a";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-chat";

async function main() {
  console.log(chalk.cyan("\n" + "═".repeat(70)));
  console.log(chalk.cyan("║" + " ".repeat(68) + "║"));
  console.log(
    chalk.cyan("║") +
      chalk.bold.white("     📚 Testing All Academic Data Sources     ") +
      chalk.cyan("║"),
  );
  console.log(chalk.cyan("║" + " ".repeat(68) + "║"));
  console.log(chalk.cyan("═".repeat(70)));

  try {
    // Initialize DeepSeek provider
    console.log(chalk.blue("\n🔧 Initializing DeepSeek AI..."));
    const provider = new OpenAIModelProvider({
      apiKey: DEEPSEEK_API_KEY,
      baseUrl: DEEPSEEK_BASE_URL,
    });

    console.log(chalk.green("✓ DeepSeek provider initialized"));
    console.log(chalk.gray(`  Model: ${DEEPSEEK_MODEL}`));
    console.log(chalk.gray(`  Base URL: ${DEEPSEEK_BASE_URL}`));

    // Create context and agent
    const context = await createZypherContext(Deno.cwd());
    const agent = new ZypherAgent(context, provider);

    // Register all research tools
    console.log(chalk.blue("\n🔧 Registering research tools..."));
    agent.mcp.registerTool(ArXivSearchTool);
    agent.mcp.registerTool(PubMedSearchTool);
    agent.mcp.registerTool(SemanticScholarSearchTool);
    agent.mcp.registerTool(CrossRefSearchTool);
    agent.mcp.registerTool(OpenAlexSearchTool);

    console.log(chalk.green("✓ ArXiv search tool registered"));
    console.log(chalk.green("✓ PubMed search tool registered"));
    console.log(chalk.green("✓ Semantic Scholar search tool registered"));
    console.log(chalk.green("✓ CrossRef search tool registered"));
    console.log(chalk.green("✓ OpenAlex search tool registered"));
    console.log();

    // Define comprehensive test task
    const taskDescription = `
请帮我测试所有的学术数据源，搜索主题为"机器学习"或"machine learning"的论文。

请按照以下顺序测试每个数据源，每个只搜索2篇论文：

1. **arXiv** - 搜索物理、计算机科学等领域
2. **PubMed** - 搜索生物医学领域
3. **Semantic Scholar** - 搜索多学科领域
4. **CrossRef** - 搜索跨出版商数据库
5. **OpenAlex** - 搜索综合学术图谱

对于每个数据源，请输出：
- 数据源名称
- 搜索结果数量
- 第一篇论文的标题和作者
- 是否成功获取数据

最后，请总结：
- 哪些数据源工作正常
- 哪些数据源出现问题
- 建议使用哪个数据源来搜索不同领域的论文

请用中文回答，条理清晰。
`.trim();

    console.log(chalk.magenta("📝 Test Task:"));
    console.log(
      chalk.gray("   Testing all data sources with 'machine learning' query"),
    );
    console.log(chalk.gray("   Searching 2 papers from each source\n"));

    console.log(chalk.yellow("🔍 Starting comprehensive test...\n"));
    console.log(chalk.gray("─".repeat(70)));
    console.log();

    // Run the task
    const events = agent.runTask(taskDescription, DEEPSEEK_MODEL);

    let fullReport = "";
    let toolsUsed = 0;

    for await (const event of events) {
      switch (event.type) {
        case "text":
          fullReport += event.content;
          process.stdout.write(chalk.white(event.content));
          break;

        case "tool_use":
          toolsUsed++;
          console.log(chalk.yellow(`\n\n🔧 Using tool: ${event.toolName}\n`));
          break;

        case "tool_use_approved":
          console.log(chalk.green(`✓ Tool approved\n`));
          break;

        case "cancelled":
          console.log(chalk.red(`\n\n❌ Task cancelled: ${event.reason}`));
          return;

        default:
          break;
      }
    }

    console.log();
    console.log(chalk.gray("─".repeat(70)));
    console.log();

    // Summary
    console.log(chalk.green("\n✅ Data source testing completed!"));
    console.log(chalk.gray(`   Tools used: ${toolsUsed}`));
    console.log(chalk.gray(`   Report length: ${fullReport.length} characters`));

    // Save report to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `data_sources_test_report_${timestamp}.md`;

    await Deno.writeTextFile(filename, fullReport);
    console.log(chalk.blue(`   💾 Report saved to: ${filename}`));

    console.log(chalk.cyan("\n" + "═".repeat(70)));
    console.log(chalk.green("\n🎉 All data sources tested successfully!\n"));
  } catch (error) {
    console.error(chalk.red("\n❌ Error:"), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    Deno.exit(1);
  }
}

// Handle Ctrl+C
Deno.addSignalListener("SIGINT", () => {
  console.log(chalk.yellow("\n\n👋 Test interrupted by user\n"));
  Deno.exit(0);
});

// Run
if (import.meta.main) {
  main().catch((error) => {
    console.error(chalk.red("Fatal error:"), error);
    Deno.exit(1);
  });
}
