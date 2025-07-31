import "jsr:@std/dotenv/load";
import { type StreamHandler, ZypherAgent } from "../src/ZypherAgent.ts";
import {
  CopyFileTool,
  DeleteFileTool,
  EditFileTool,
  FileSearchTool,
  GrepSearchTool,
  ImageEditTool,
  ImageGenTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
} from "../src/tools/mod.ts";
import { formatError } from "../src/error.ts";
import { McpServerManager } from "../src/mcp/McpServerManager.ts";
import chalk from "chalk";

const mcp1 = new McpServerManager();
const mcp2 = new McpServerManager();

async function initAgent(userId: string, mcp: McpServerManager) {
  const agent = new ZypherAgent({
    userId,
    baseUrl: Deno.env.get("ZYPHER_BASE_URL"),
    anthropicApiKey: Deno.env.get("ZYPHER_API_KEY"),
    persistHistory: false,
  }, mcp);

  mcp.registerTool(ReadFileTool);
  mcp.registerTool(ListDirTool);
  mcp.registerTool(EditFileTool);
  mcp.registerTool(RunTerminalCmdTool);
  mcp.registerTool(GrepSearchTool);
  mcp.registerTool(FileSearchTool);
  mcp.registerTool(CopyFileTool);
  mcp.registerTool(DeleteFileTool);
  mcp.registerTool(ImageGenTool);
  mcp.registerTool(ImageEditTool);

  await mcp.init();
  await agent.init();
  return agent;
}

async function runPrompt(agent: ZypherAgent, prompt: string): Promise<string> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Prompt is empty");

  let output = "";
  const handler: StreamHandler = {
    onContent: (c) => (output += c),
  };

  await agent.runTaskWithStreaming(trimmed, undefined, handler,[], {think: true});
  return output.trim();
}

async function multiAgentPlanner() {
  const agent1 = await initAgent("agent1", mcp1);
  const agent2 = await initAgent("agent2", mcp2);

  const question = "question:Of the authors (First M. Last) that worked on the paper \"Pie Menus or Linear Menus, Which Is Better?\" in 2015, what was the title of the first paper authored by the one that had authored prior papers?";

  const planningPrompt = `I have a question about \"${question}\". Interpret the task requirements and provide a high-level plan including key subgoals of the task, outlining the sequence of actions required to complete it.`;
  console.log(chalk.blue("\n[Agent1] Planning the task..."));
  const plan = await runPrompt(agent1, planningPrompt);
  console.log(chalk.green("\n🔧 High-Level Plan:\n" + plan + "\n"));

  const steps = plan
    .split(/\n|\d+\.\s*|\*-|•|\u2022|\u000a/) // handle various list markers
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (let i = 0; i < steps.length; ) {
    const step = steps[i];
    console.log(chalk.blue(`\n[Agent1] Step ${i + 1}: ${step}`));

    let execution = await runPrompt(agent1, `Please perform this step: ${step}`);
    console.log(chalk.gray("\n[Agent1 Result]:\n" + execution));

    const validationPrompt = `You are validating the result of a task step.\nStep: ${step}\nResult: ${execution}\n\nReply with '✅ Pass' or '❌ Fail' and briefly explain.`;
    const validation = await runPrompt(agent2, validationPrompt);
    console.log(chalk.yellow("\n[Agent2 Validation]:\n" + validation));

    if (validation.includes("✅") || validation.toLowerCase().includes("pass")) {
      console.log(chalk.cyan("\n✅ Step passed. Proceeding to next."));
      i++;
    } else {
      console.log(chalk.red("\n❌ Step failed. Re-executing with feedback..."));
      const feedbackPrompt = `The result of the following step was not accepted:\nStep: ${step}\nReviewer Feedback: ${validation}\n\nPlease redo the step with improvements.`;
      execution = await runPrompt(agent1, feedbackPrompt);
    }
  }

  console.log(chalk.green("\n🎉 All steps completed successfully."));
}

if (import.meta.main) {
  multiAgentPlanner().catch((err) => {
    console.error("Fatal error:", formatError(err));
    Deno.exit(1);
  });
}
