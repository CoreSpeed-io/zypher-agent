#!/usr/bin/env -S deno run -A

/**
 * Urban Crime Prediction Research Demo
 *
 * Search arXiv for papers on urban crime prediction and generate a report
 * Using DeepSeek API for analysis
 */

import "@std/dotenv/load";
import {
  createZypherContext,
  OpenAIModelProvider,
  ZypherAgent,
} from "@zypher/mod.ts";
import { ArXivSearchTool, SendEmailTool } from "@zypher/tools/mod.ts";
import chalk from "chalk";

// DeepSeek Configuration
const DEEPSEEK_API_KEY = "sk-50ef015b4dbe4bb893c19e0b70c4cc9a";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-chat";

// Email configuration
const RECIPIENT_EMAIL = "softlight1998@aliyun.com";

async function main() {
  console.log(chalk.cyan("\n" + "═".repeat(70)));
  console.log(chalk.cyan("║" + " ".repeat(68) + "║"));
  console.log(chalk.cyan("║") + chalk.bold.white("     🏙️  Urban Crime Prediction Research - arXiv Search     ") + chalk.cyan("║"));
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

    // Register tools
    agent.mcp.registerTool(ArXivSearchTool);

    // Check if email is configured
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL");

    if (resendKey && fromEmail) {
      agent.mcp.registerTool(SendEmailTool);
      console.log(chalk.green("✓ Email tool registered"));
    } else {
      console.log(chalk.yellow("⚠️  Email not configured (will display report only)"));
    }

    console.log(chalk.green("✓ ArXiv search tool registered"));
    console.log();

    // Define research task
    const taskDescription = `
Please search arXiv for recent papers on "urban crime prediction" or "crime forecasting".

Search for up to 10 papers, focusing on the most recent ones.

After finding the papers, please:

1. **列出论文清单**（中英文标题）
   - 按发表时间排序
   - 包含作者、发表日期、arXiv链接

2. **总结研究趋势**（用中文）
   - 当前主流的犯罪预测方法
   - 使用的数据类型和特征
   - 主要的机器学习/深度学习模型
   - 应用场景和城市

3. **重点论文分析**（选择2-3篇最相关的）
   - 创新点
   - 方法论
   - 实验结果
   - 局限性

4. **研究展望**
   - 未来研究方向
   - 技术挑战
   - 应用前景

请生成一份结构清晰、内容详实的研究报告。
${resendKey && fromEmail ? `\n5. 最后，请将这份报告发送到邮箱：${RECIPIENT_EMAIL}` : ''}
`.trim();

    console.log(chalk.magenta("📝 Research Task:"));
    console.log(chalk.gray("   Search arXiv for urban crime prediction papers"));
    console.log(chalk.gray("   Generate comprehensive analysis report"));
    console.log(chalk.gray(`   Recipient: ${RECIPIENT_EMAIL}\n`));

    console.log(chalk.yellow("🔍 Starting research...\n"));
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
      console.log(chalk.yellow(`   📄 Report displayed above (email not configured)`));
    }

    // Save report to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `urban_crime_prediction_report_${timestamp}.md`;

    await Deno.writeTextFile(filename, fullReport);
    console.log(chalk.blue(`   💾 Report saved to: ${filename}`));

    console.log(chalk.cyan("\n" + "═".repeat(70)));
    console.log(chalk.green("\n🎉 Task completed successfully!\n"));

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
