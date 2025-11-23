#!/usr/bin/env -S deno run -A

/**
 * Multi-Source Research Demo
 *
 * Demonstrates comprehensive research using all available data sources:
 * - arXiv, PubMed, Semantic Scholar, CrossRef, OpenAlex
 *
 * This example searches for papers on a specific topic across all sources
 * and generates a comprehensive comparison report.
 *
 * Usage:
 *   deno run -A examples/demo_multi_source_research.ts
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
  SendEmailTool,
} from "@zypher/tools/mod.ts";
import chalk from "chalk";

// DeepSeek Configuration
const DEEPSEEK_API_KEY = "sk-50ef015b4dbe4bb893c19e0b70c4cc9a";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-chat";

// Email configuration (optional)
const RECIPIENT_EMAIL = "softlight1998@aliyun.com";

// Research topic
const RESEARCH_TOPIC = "urban crime prediction";
const MAX_PAPERS_PER_SOURCE = 5;

async function main() {
  console.log(chalk.cyan("\n" + "═".repeat(70)));
  console.log(chalk.cyan("║" + " ".repeat(68) + "║"));
  console.log(
    chalk.cyan("║") +
      chalk.bold.white("     🔍 Multi-Source Research Assistant     ") +
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

    // Check if email is configured
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL");

    if (resendKey && fromEmail) {
      agent.mcp.registerTool(SendEmailTool);
      console.log(chalk.green("✓ Email tool registered"));
    } else {
      console.log(
        chalk.yellow("⚠️  Email not configured (will display report only)"),
      );
    }

    console.log(chalk.green("✓ All data source tools registered"));
    console.log();

    // Define comprehensive research task
    const taskDescription = `
我需要对"${RESEARCH_TOPIC}"进行全面的文献调研。

请使用以下所有数据源进行搜索，每个数据源查找${MAX_PAPERS_PER_SOURCE}篇最相关的论文：

1. **arXiv** - 搜索物理、计算机科学、统计学等预印本
2. **CrossRef** - 搜索跨出版商的正式期刊论文
3. **OpenAlex** - 搜索开放学术图谱中的全学科论文
4. **Semantic Scholar** - 搜索多学科论文并获取引用信息
5. **PubMed** - 搜索生物医学和公共卫生相关论文（如果主题相关）

对于收集到的所有论文，请进行以下分析：

## 第一部分：数据源比较
- 每个数据源找到了多少篇论文
- 各数据源的优势和特点
- 哪些数据源最适合这个主题
- 论文重复率（同一篇论文在不同数据源中出现）

## 第二部分：论文综述
按时间倒序列出所有找到的论文（去重后），包含：
- 标题（中英文）
- 作者
- 发表时间
- 来源（期刊/会议）
- 引用数（如有）
- DOI 或链接
- 数据源标记

## 第三部分：研究趋势分析
基于收集到的所有论文，分析：
- 主要研究方法和技术
- 热点研究方向
- 时间演变趋势
- 重要研究团队或机构
- 数据集和评估方法

## 第四部分：重点论文深度分析
选择3-5篇最重要的论文进行深度分析：
- 研究创新点
- 方法论
- 主要发现和贡献
- 局限性
- 对领域的影响

## 第五部分：研究展望
- 未来研究方向
- 技术挑战
- 应用前景
- 推荐阅读顺序

请生成一份结构清晰、内容详实的中文研究报告。
${resendKey && fromEmail ? `\n最后，请将这份报告发送到邮箱：${RECIPIENT_EMAIL}` : ""}
`.trim();

    console.log(chalk.magenta("📝 Research Task:"));
    console.log(chalk.gray(`   Topic: ${RESEARCH_TOPIC}`));
    console.log(
      chalk.gray(`   Papers per source: ${MAX_PAPERS_PER_SOURCE}`),
    );
    console.log(
      chalk.gray(
        `   Data sources: arXiv, CrossRef, OpenAlex, Semantic Scholar, PubMed`,
      ),
    );
    if (resendKey && fromEmail) {
      console.log(chalk.gray(`   Email recipient: ${RECIPIENT_EMAIL}`));
    }
    console.log();

    console.log(chalk.yellow("🔍 Starting comprehensive research...\n"));
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
    console.log(chalk.green("\n✅ Research completed!"));
    console.log(chalk.gray(`   Tools used: ${toolsUsed}`));
    console.log(chalk.gray(`   Report length: ${fullReport.length} characters`));

    if (resendKey && fromEmail) {
      console.log(chalk.green(`   📧 Report sent to: ${RECIPIENT_EMAIL}`));
    } else {
      console.log(
        chalk.yellow(`   📄 Report displayed above (email not configured)`),
      );
    }

    // Save report to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `multi_source_research_${
      RESEARCH_TOPIC.replace(/\s+/g, "_")
    }_${timestamp}.md`;

    await Deno.writeTextFile(filename, fullReport);
    console.log(chalk.blue(`   💾 Report saved to: ${filename}`));

    console.log(chalk.cyan("\n" + "═".repeat(70)));
    console.log(chalk.green("\n🎉 Multi-source research completed!\n"));
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
  console.log(chalk.yellow("\n\n👋 Research interrupted by user\n"));
  Deno.exit(0);
});

// Run
if (import.meta.main) {
  main().catch((error) => {
    console.error(chalk.red("Fatal error:"), error);
    Deno.exit(1);
  });
}
