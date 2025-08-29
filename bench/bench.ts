import "jsr:@std/dotenv/load";
import { ZypherAgent } from "../src/ZypherAgent.ts";
import {
  CopyFileTool,
  DeleteFileTool,
  EditFileTool,
  FileSearchTool,
  GrepSearchTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
} from "../src/tools/mod.ts";
import { formatError } from "../src/error.ts";
import { McpServerManager } from "../src/mcp/McpServerManager.ts";
import type { FileAttachment } from "../src/message.ts";
import { S3StorageService } from "../src/storage/S3StorageService.ts";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import * as path from "@std/path";
import { AnthropicModelProvider } from "@zypher/llm/mod.ts";
import {
  LoopInterceptorManager,
  ToolExecutionInterceptor,
} from "@zypher/loopInterceptors/mod.ts";
import chalk from "chalk";
import { eachValueFrom } from "rxjs-for-await";
import { printMessage } from "../src/message.ts";

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

async function createFileAttachmentsForTask(
  task: GAIATask,
  // workspaceDir: string,
  storageService: S3StorageService,
): Promise<FileAttachment[]> {
  const attachments: FileAttachment[] = [];

  if (!task.file_name) {
    return attachments;
  }

  // const taskWorkspace = join(workspaceDir, task.task_id);
  const filePath = task.file_name;

  try {
    // Check if file exists
    const fileInfo = await Deno.stat(filePath);
    if (!fileInfo.isFile) {
      console.warn(`⚠️  ${task.file_name} is not a file`);
      return attachments;
    }

    // Determine MIME type from file extension
    const ext = path.extname(task.file_name).toLowerCase();
    let contentType: string;

    switch (ext) {
      // case '.jpg':
      // case '.jpeg':
      //   contentType = 'image/jpeg';
      //   break;
      // case '.png':
      //   contentType = 'image/png';
      //   break;
      // case '.gif':
      //   contentType = 'image/gif';
      //   break;
      // case '.webp':
      //   contentType = 'image/webp';
      //   break;
      case ".pdf":
        contentType = "application/pdf";
        break;
      default:
        console.log(`⚠️  File ${task.file_name} has unsupported type: ${ext}`);
        return attachments;
    }

    // Check if the content type is supported
    // if (!isFileTypeSupported(contentType)) {
    //   console.log(
    //     `⚠️  File ${task.file_name} has unsupported content type: ${contentType}`,
    //   );
    //   return attachments;
    // }

    // Read file and upload to S3
    const fileBuffer = await Deno.readFile(filePath);

    const uploadResult = await storageService.uploadFromBuffer(fileBuffer, {
      filename: task.file_name,
      contentType: contentType,
      size: fileBuffer.length,
    });

    // Create file attachment
    const fileAttachment: FileAttachment = {
      type: "file_attachment",
      fileId: uploadResult.id,
      mimeType: contentType, // We know it's supported from the check above
    };

    attachments.push(fileAttachment);
    console.log(
      `📎 Created file attachment for ${task.file_name} (${contentType}) -> ${uploadResult.id}`,
    );
  } catch (error) {
    console.warn(
      `⚠️  Failed to create file attachment for ${task.file_name}: ${
        formatError(error)
      }`,
    );
  }

  return attachments;
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
  storageService: S3StorageService | undefined,
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
      // Create file attachments for supported files if storage service is available
      let fileAttachments: FileAttachment[] = [];
      if (storageService) {
        fileAttachments = await createFileAttachmentsForTask(
          task,
          // workspaceDir,
          storageService,
        );
      }

      if (!model) {
        model = "claude-sonnet-4-20250514";
      }

      const taskEvents = await agent.runTask(
        task.Question,
        model,
        fileAttachments.length > 0 ? fileAttachments : undefined,
      );

      let isFirstTextChunk = true;
      let cancelled = false;

      for await (const event of eachValueFrom(taskEvents)) {
        if (event.type === "text") {
          if (isFirstTextChunk) {
            Deno.stdout.write(textEncoder.encode(chalk.blue("🤖 ")));
            isFirstTextChunk = false;
          }

          // Write the text without newline to allow continuous streaming
          Deno.stdout.write(textEncoder.encode(event.content));
          agentAnswer += event.content;
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
          if (event.message.role === "assistant") {
            messagesCount++;
          }
        } else if (event.type === "tool_use") {
          Deno.stdout.write(
            textEncoder.encode(`\n\n🔧 Using tool: ${event.toolName}\n`),
          );
        } else if (event.type === "tool_use_input") {
          Deno.stdout.write(textEncoder.encode(event.partialInput));
        } else if (event.type === "cancelled") {
          cancelled = true;
          console.log("\n🛑 Task cancelled, reason: ", event.reason, "\n");
        }
      }

      // Add extra newlines for readability after completion
      Deno.stdout.write(textEncoder.encode("\n\n"));

      if (!cancelled) {
        success = true;
        console.log(`\n✅ Task ${task.task_id} completed\n`);
      }
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

  // ensure output directory exists
  await ensureDir(outputPath);

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
      BENCHMARK_LEVEL ? parseInt(BENCHMARK_LEVEL) : undefined,
    );
    console.log(`✅ Loaded ${tasks.length} tasks`);

    // Ensure workspace directory exists
    await ensureDir(BENCHMARK_WORKSPACE);

    // Initialize S3 storage service for file attachments
    // let storageService: S3StorageService | undefined;

    // Only initialize S3 if AWS credentials are available
    const awsAccessKeyId = Deno.env.get("S3_ACCESS_KEY_ID")!;
    const awsSecretAccessKey = Deno.env.get("S3_SECRET_ACCESS_KEY")!;
    const awsRegion = Deno.env.get("S3_REGION")!;
    const s3Bucket = Deno.env.get("S3_BUCKET_NAME")!;

    const storageService = new S3StorageService({
      bucket: s3Bucket,
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });
    console.log(
      `🗄️  Initialized S3 storage service (bucket: ${s3Bucket}, region: ${awsRegion})`,
    );

    // Initialize MCP Server Manager
    const mcpServerManager = new McpServerManager();
    await mcpServerManager.init();

    // Register all available tools
    mcpServerManager.registerTool(ReadFileTool);
    mcpServerManager.registerTool(ListDirTool);
    mcpServerManager.registerTool(EditFileTool);
    mcpServerManager.registerTool(RunTerminalCmdTool);
    mcpServerManager.registerTool(GrepSearchTool);
    mcpServerManager.registerTool(FileSearchTool);
    mcpServerManager.registerTool(CopyFileTool);
    mcpServerManager.registerTool(DeleteFileTool);
    // mcpServerManager.registerTool(YouTubeVideoAccessTool);
    // mcpServerManager.registerTool(WebSearchTool);
    // mcpServerManager.registerTool(WebsiteAccessTool);
    // mcpServerManager.registerTool(AudioToTextTool);
    // mcpServerManager.registerTool(AskImageQuestionTool);
    // mcpServerManager.registerTool(AskFileUrlQuestionTool);

    // mcpServerManager.registerTool(AccessWebsiteInBrowserTool);
    // mcpServerManager.registerTool(ClickWebsiteElementInBrowserTool);
    // mcpServerManager.registerTool(FillInputElementInBrowserTool);

    // mcpServerManager.registerTool(SearchWikipediaTool);
    // mcpServerManager.registerTool(VideoFrameAtTimeTool);
    // mcpServerManager.registerTool(VideoAudioExtractTool);
    // mcpServerManager.registerTool(VideoDownloadTool);
    // mcpServerManager.registerTool(VideoToGifClipTool);

    // mcpServerManager.registerTool(VideoInferenceTool);
    // mcpServerManager.registerTool(VideoCompressionTool);

    // mcpServerManager.registerTool(BrowserOpenSessionTool);
    // mcpServerManager.registerTool(BrowserCloseSessionTool);
    // mcpServerManager.registerTool(BrowserNavigateTool);
    // mcpServerManager.registerTool(BrowserForwardTool);
    // mcpServerManager.registerTool(BrowserBackTool);
    // mcpServerManager.registerTool(BrowserHoverTool);
    // mcpServerManager.registerTool(BrowserScrollTool);
    // mcpServerManager.registerTool(BrowserViewportScreenshotTool);
    // mcpServerManager.registerTool(GetInteractiveElementsTool);
    // mcpServerManager.registerTool(BrowserClickByIdTool);

    // mcpServerManager.registerTool(BrowserViewportInteractivesScreenshotTool);
    // mcpServerManager.registerTool(ClickInteractiveByIdTool);
    // mcpServerManager.registerTool(BrowserTypeTool);

    console.log(
      "🔧 Registered tools:",
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
        const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (!anthropicApiKey) {
          throw new Error("Missing ANTHROPIC_API_KEY");
        }
        const loopInterceptorManager = new LoopInterceptorManager();
        loopInterceptorManager.register(
          new ToolExecutionInterceptor(mcpServerManager),
        );

        const agent = new ZypherAgent(
          new AnthropicModelProvider({
            apiKey: anthropicApiKey,
          }),
          mcpServerManager,
          loopInterceptorManager,
          {
            persistHistory: false,
            enableCheckpointing: false,
            taskTimeoutMs: 3000000,
          },
          storageService,
        );

        await agent.init();

        // Run the benchmark task
        const result = await runBenchmarkTask(
          task,
          agent,
          BENCHMARK_WORKSPACE,
          storageService,
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
    Deno.exit(0);
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
