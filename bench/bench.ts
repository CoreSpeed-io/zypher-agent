import "jsr:@std/dotenv/load";
import { type StreamHandler, ZypherAgent } from "../src/ZypherAgent.ts";
import {
  CopyFileTool,
  DeleteFileTool,
  EditFileTool,
  FileSearchTool,
  GrepSearchTool,
  ListDirTool,
  ReadFileTool,
  YouTubeVideoAccessTool,
  RunTerminalCmdTool,
  WebSearchTool,
  WebsiteAccessTool,
  AudioToTextTool,
} from "../src/tools/mod.ts";
import { formatError } from "../src/error.ts";
import { McpServerManager } from "../src/mcp/McpServerManager.ts";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { exit } from "node:process";


const BENCHMARK_DATASET = Deno.env.get("BENCHMARK_DATASET")!;
const BENCHMARK_MODE = Deno.env.get("BENCHMARK_MODE")! as "test" | "validation";
const BENCHMARK_LEVEL = Deno.env.get("BENCHMARK_LEVEL");
const BENCHMARK_METADATA = Deno.env.get("BENCHMARK_METADATA")!;
const BENCHMARK_WORKSPACE = Deno.env.get("BENCHMARK_WORKSPACE")!;
const BENCHMARK_MODEL = Deno.env.get("BENCHMARK_MODEL")!;
// const BENCHMARK_PROMPT =
//   `You are a general AI assistant. I will ask you a question. Report your \
// thoughts, and finish your answer with the following template: \
// FINAL ANSWER: [YOUR FINAL ANSWER]. YOUR FINAL ANSWER should be a number OR \
// as few words as possible OR a comma separated list of numbers and/or \
// strings. If you are asked for a number, don't use comma to write your number \
// neither use units such as $ or percent sign unless specified otherwise. If \
// you are asked for a string, don't use articles, neither abbreviations (e.g. \
// for cities), and write the digits in plain text unless specified otherwise. \
// If you are asked for a comma separated list, apply the above rules depending \
// of whether the element to be put in the list is a number or a string.`;
const BENCHMARK_OUTPUT = Deno.env.get("BENCHMARK_OUTPUT")!;

interface GAIATask {
  task_id: string;
  Question: string;
  Level: number;
  file_name: string;
  "Final answer": string;
  "Annotator Metadata": {
    Steps: string;
    "Number of steps": string;
    "How long did this take?": string;
    Tools: string;
    "Number of tools": string;
  };
}

interface BenchmarkResult {
  task_id: string;
  question: string;
  level: number;
  file_name: string;
  expected_answer: string;
  agent_answer: string;
  success: boolean;
  error?: string;
  duration_ms: number;
  messages_count: number;
  timestamp: string;
}

const textEncoder = new TextEncoder();

async function loadGAIADataset(
  datasetPath: string,
  mode: "test" | "validation",
  metadataName: string,
  level?: number,
): Promise<GAIATask[]> {
  // Construct the path to the metadata.jsonl file based on the dataset structure
  const metadataPath = join(datasetPath, "2023", mode, metadataName + ".jsonl");

  try {
    const content = await Deno.readTextFile(metadataPath);
    const lines = content.trim().split("\n");
    const tasks: GAIATask[] = [];

    for (const line of lines) {
      if (line.trim()) {
        try {
          const task = JSON.parse(line) as GAIATask;

          // Filter by level if specified
          if (level === undefined || task.Level === level) {
            tasks.push(task);
          }
        } catch (error) {
          console.warn(`Failed to parse line: ${line}`, error);
        }
      }
    }

    return tasks;
  } catch (error) {
    throw new Error(
      `Failed to load GAIA dataset from ${metadataPath}: ${formatError(error)}`,
    );
  }
}

async function setupWorkspaceForTask(
  task: GAIATask,
  workspaceDir: string,
  datasetPath: string,
  mode: string,
): Promise<void> {
  // Create task-specific workspace
  const taskWorkspace = join(workspaceDir, task.task_id);
  await ensureDir(taskWorkspace);

  // Create .zypherrules file, disabled due to a bug in Zypher Agent
  // await Deno.writeTextFile(
  //   join(taskWorkspace, ".zypherrules"),
  //   BENCHMARK_PROMPT,
  // );

  // If task has an associated file, copy it to the workspace
  if (task.file_name) {
    const sourceFile = join(datasetPath, "2023", mode, task.file_name);
    const targetFile = join(taskWorkspace, task.file_name);

    try {
      await Deno.copyFile(sourceFile, targetFile);
      console.log(`📁 Copied file ${sourceFile} to workspace`);
    } catch (error) {
      console.warn(
        `⚠️  Failed to copy file ${sourceFile}: ${formatError(error)}`,
      );
    }
  }
}

async function cleanupWorkspaceForTask(
  task: GAIATask,
  workspaceDir: string,
): Promise<void> {
  const taskWorkspace = join(workspaceDir, task.task_id);
  try {
    await Deno.remove(taskWorkspace, { recursive: true });
    console.log(`🧹 Cleaned up workspace for task ${task.task_id}`);
  } catch (error) {
    console.warn(
      `⚠️  Failed to cleanup workspace for task ${task.task_id}: ${
        formatError(error)
      }`,
    );
  }
}

async function runBenchmarkTask(
  task: GAIATask,
  agent: ZypherAgent,
  workspaceDir: string,
  model?: string,
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  const taskWorkspace = join(workspaceDir, task.task_id);

  console.log(`\n🚀 Running task ${task.task_id} (Level ${task.Level})`);
  console.log(`📝 Question: ${task.Question}`);
  if (task.file_name) {
    console.log(`📄 File: ${task.file_name}`);
  }

  let agentAnswer = "";
  let success = false;
  let error: string | undefined;
  let messagesCount = 0;

  try {
    // Change to task workspace
    const originalCwd = Deno.cwd();
    Deno.chdir(taskWorkspace);

    try {
      // Setup streaming handler to capture the response
      const streamHandler: StreamHandler = {
        onContent: (content, isFirstChunk) => {
          if (isFirstChunk) {
            Deno.stdout.write(textEncoder.encode("🤖 "));
          }
          Deno.stdout.write(textEncoder.encode(content));
          agentAnswer += content;
        },
        onToolUse: (name, partialInput) => {
          Deno.stdout.write(textEncoder.encode(`\n🔧 Using tool: ${name}\n`));
          Deno.stdout.write(textEncoder.encode(partialInput));
        },
        onMessage: (message) => {
          messagesCount++;
          Deno.stdout.write(textEncoder.encode("\n"));
        },
      };

      // Run the task
      await agent.runTaskWithStreaming(task.Question, model, streamHandler);

      success = true;
      console.log(`\n✅ Task ${task.task_id} completed`);
    } finally {
      // Always restore original working directory
      Deno.chdir(originalCwd);
    }
  } catch (err) {
    error = formatError(err);
    console.error(`\n❌ Task ${task.task_id} failed: ${error}`);
  }

  const duration = Date.now() - startTime;

  return {
    task_id: task.task_id,
    question: task.Question,
    level: task.Level,
    file_name: task.file_name,
    expected_answer: task["Final answer"],
    agent_answer: agentAnswer.trim(),
    success,
    error,
    duration_ms: duration,
    messages_count: messagesCount,
    timestamp: new Date().toISOString(),
  };
}

async function saveBenchmarkResult(
  result: BenchmarkResult,
  outputPath: string,
): Promise<void> {
  const resultLine = JSON.stringify(result) + "\n";

  try {
    await Deno.writeTextFile(join(outputPath, result.task_id), resultLine, {
      append: true,
    });
  } catch (error) {
    console.error(`Failed to save result: ${formatError(error)}`);
  }
}

async function main(): Promise<void> {
  try {
    // Load GAIA dataset
    console.log(
      `\n📖 Loading GAIA dataset from ${BENCHMARK_DATASET} (mode: ${BENCHMARK_MODE})`,
    );
    const tasks = await loadGAIADataset(
      BENCHMARK_DATASET!,
      BENCHMARK_MODE as "test" | "validation",
      BENCHMARK_METADATA,
      BENCHMARK_LEVEL ? parseInt(BENCHMARK_LEVEL) : undefined
    );
    console.log(`✅ Loaded ${tasks.length} tasks`);

    // Ensure workspace directory exists
    await ensureDir(BENCHMARK_WORKSPACE);

    // Initialize MCP Server Manager
    const mcpServerManager = new McpServerManager();
    await mcpServerManager.init();

    // Register all available tools
    await mcpServerManager.registerTool(ReadFileTool);
    await mcpServerManager.registerTool(ListDirTool);
    await mcpServerManager.registerTool(EditFileTool);
    await mcpServerManager.registerTool(RunTerminalCmdTool);
    await mcpServerManager.registerTool(GrepSearchTool);
    await mcpServerManager.registerTool(FileSearchTool);
    await mcpServerManager.registerTool(CopyFileTool);
    await mcpServerManager.registerTool(DeleteFileTool);
    await mcpServerManager.registerTool(YouTubeVideoAccessTool);
    await mcpServerManager.registerTool(WebSearchTool);
    await mcpServerManager.registerTool(WebsiteAccessTool);
    await mcpServerManager.registerTool(AudioToTextTool);

    console.log(
      "🔧 Registered tools:",
      Array.from(mcpServerManager.getAllTools().keys()).join(", "),
    );

    // Run benchmark tasks
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      console.log(`\n🎯 Progress: ${i + 1}/${tasks.length}`);

      try {
        // Setup workspace for this task
        await setupWorkspaceForTask(
          task,
          BENCHMARK_WORKSPACE,
          BENCHMARK_DATASET!,
          BENCHMARK_MODE!,
        );

        // Initialize a fresh agent instance for each task
        const agent = new ZypherAgent(
          {
            anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY"),
            persistHistory: false,
            enableCheckpointing: false,
          },
          mcpServerManager,
        );

        await agent.init();

        // Run the benchmark task
        const result = await runBenchmarkTask(
          task,
          agent,
          BENCHMARK_WORKSPACE,
          BENCHMARK_MODEL,
        );

        results.push(result);

        // Save result immediately
        await saveBenchmarkResult(result, BENCHMARK_OUTPUT);

        // Clean up workspace
        // await cleanupWorkspaceForTask(task, BENCHMARK_WORKSPACE);
      } catch (error) {
        console.error(
          `💥 Fatal error processing task ${task.task_id}: ${
            formatError(error)
          }`,
        );

        // Save error result
        const errorResult: BenchmarkResult = {
          task_id: task.task_id,
          question: task.Question,
          level: task.Level,
          file_name: task.file_name,
          expected_answer: task["Final answer"],
          agent_answer: "",
          success: false,
          error: formatError(error),
          duration_ms: 0,
          messages_count: 0,
          timestamp: new Date().toISOString(),
        };

        results.push(errorResult);
        await saveBenchmarkResult(errorResult, BENCHMARK_OUTPUT);

        // Clean up workspace on error
        // try {
        //   await cleanupWorkspaceForTask(task, BENCHMARK_WORKSPACE);
        // } catch (cleanupError) {
        //   console.warn(
        //     `Failed to cleanup after error: ${formatError(cleanupError)}`,
        //   );
        // }
      }
    }

    console.log(`\n💾 Results saved`);
    console.log("🎉 Benchmark completed!");
  } catch (error) {
    console.error("💥 Fatal Error:", formatError(error));
    Deno.exit(1);
  }
}

// Handle Ctrl+C
Deno.addSignalListener("SIGINT", () => {
  console.log("\n\n🛑 Benchmark interrupted by user");
  Deno.exit(0);
});

// Run the benchmark
main().catch((error) => {
  console.error("Unhandled error:", formatError(error));
  Deno.exit(1);
});
