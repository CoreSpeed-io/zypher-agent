import "@std/dotenv/load";
import {
  AnthropicModelProvider,
  createZypherContext,
  formatError,
  OpenAIModelProvider,
  runAgentInTerminal,
  ZypherAgent,
} from "@zypher/mod.ts";
import {
  BrowserEvalTool,
  CopyFileTool,
  createBrowserCookiesTools,
  createBrowserInteractionTools,
  createBrowserLocalStorageTools,
  createBrowserNavigationTools,
  createBrowserScreenshotTools,
  createBrowserSessionTools,
  createBrowserWaitTools,
  createEditFileTools,
  createImageTools,
  DeleteFileTool,
  FileSearchTool,
  GrepSearchTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
  WebSearchTool,
} from "@zypher/tools/mod.ts";
import { Command, EnumType } from "@cliffy/command";
import chalk from "chalk";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OPENAI_MODEL = "gpt-4o-2024-11-20";
const DEFAULT_BACKUP_DIR = "./.backup";
const DEFAULT_BROWSER_STORAGE_EXPORT_DIR = "./.local_storage_states";
const DEFAULT_BROWSER_SCREENSHOTS_DIR = "./.screenshots";
const DEFAULT_DOWNLOAD_DIR = "./.downloads";

const providerType = new EnumType(["anthropic", "openai"]);

// Parse command line arguments using Cliffy
const { options: cli } = await new Command()
  .name("zypher")
  .description("Zypher Agent CLI")
  .type("provider", providerType)
  .option("-k, --api-key <apiKey:string>", "Model provider API key", {
    required: true,
  })
  .option("-m, --model <model:string>", "Model name")
  .option(
    "-p, --provider <provider:provider>",
    "Model provider",
  )
  .option("-b, --base-url <baseUrl:string>", "Custom API base URL")
  .option(
    "-w, --workDir <workingDirectory:string>",
    "Working directory for agent operations",
  )
  .option("-u, --user-id <userId:string>", "Custom user ID")
  .option(
    "--openai-api-key <openaiApiKey:string>",
    "OpenAI API key for image tools when provider=anthropic (ignored if provider=openai)",
  )
  .option("--backup-dir <backupDir:string>", "Directory to store backups")
  .option(
    "--browser-storage-export-dir <storageDir:string>",
    "Directory to store exported browser local storage states",
  )
  .option(
    "--browser-screenshots-dir <screenshotsDir:string>",
    "Directory to store browser screenshots",
  )
  .option(
    "--download-dir <downloadDir:string>",
    "Directory to store browser downloads",
  )
  .parse(Deno.args);

function inferProvider(
  provider?: string,
  model?: string,
): "anthropic" | "openai" {
  const p = provider?.toLowerCase();
  if (p === "openai" || p === "anthropic") return p;
  if (!model) return "anthropic";
  const m = model.toLowerCase();
  if (
    m.includes("claude") || m.startsWith("sonnet") || m.startsWith("haiku") ||
    m.startsWith("opus")
  ) {
    return "anthropic";
  }
  return "openai"; // fallback to OpenAI-compatible models
}

async function main(): Promise<void> {
  try {
    // Log CLI configuration
    if (cli.userId) {
      console.log(`👤 Using user ID: ${cli.userId}`);
    }

    if (cli.baseUrl) {
      console.log(`🌐 Using API base URL: ${cli.baseUrl}`);
    }

    if (cli.workDir) {
      console.log(`💻 Using working directory: ${cli.workDir}`);
    }

    const selectedProvider = inferProvider(cli.provider, cli.model);
    console.log(`🤖 Using provider: ${chalk.magenta(selectedProvider)}`);

    const modelToUse = cli.model ??
      (selectedProvider === "openai"
        ? DEFAULT_OPENAI_MODEL
        : DEFAULT_ANTHROPIC_MODEL);
    console.log(`🧠 Using model: ${chalk.cyan(modelToUse)}`);

    // Initialize the agent with provided options
    const providerInstance = selectedProvider === "openai"
      ? new OpenAIModelProvider({
        apiKey: cli.apiKey,
        baseUrl: cli.baseUrl,
      })
      : new AnthropicModelProvider({
        apiKey: cli.apiKey,
        baseUrl: cli.baseUrl,
      });

    const workingDirectory = cli.workDir ?? Deno.cwd();
    const context = await createZypherContext(
      workingDirectory,
      {
        userId: cli.userId,
      },
    );

    const agent = new ZypherAgent(
      context,
      providerInstance,
    );

    const mcpServerManager = agent.mcp;

    // Register all available tools
    mcpServerManager.registerTool(ReadFileTool);
    mcpServerManager.registerTool(ListDirTool);
    mcpServerManager.registerTool(RunTerminalCmdTool);
    mcpServerManager.registerTool(GrepSearchTool);
    mcpServerManager.registerTool(FileSearchTool);
    mcpServerManager.registerTool(CopyFileTool);
    mcpServerManager.registerTool(DeleteFileTool);

    // Image tools are powered by OpenAI only
    const openaiApiKey = cli.provider === "openai"
      ? cli.apiKey
      : cli.openaiApiKey;

    if (openaiApiKey) {
      const { ImageGenTool, ImageEditTool } = createImageTools(openaiApiKey);
      mcpServerManager.registerTool(ImageGenTool);
      mcpServerManager.registerTool(ImageEditTool);
    }

    const backupDir = cli.backupDir ?? DEFAULT_BACKUP_DIR;
    const { EditFileTool } = createEditFileTools(backupDir);
    mcpServerManager.registerTool(EditFileTool);

    // Register browser tools
    const {
      BrowserGetCookiesTool,
      BrowserSetCookiesTool,
      BrowserClearCookiesTool,
    } = createBrowserCookiesTools();
    mcpServerManager.registerTool(BrowserGetCookiesTool);
    mcpServerManager.registerTool(BrowserSetCookiesTool);
    mcpServerManager.registerTool(BrowserClearCookiesTool);

    mcpServerManager.registerTool(BrowserEvalTool);

    const {
      BrowserHoverTool,
      BrowserScrollTool,
      BrowserClickTool,
      BrowserFileUploadTool,
      BrowserDownloadTool,
      BrowserInputTool,
    } = createBrowserInteractionTools(cli.downloadDir ?? DEFAULT_DOWNLOAD_DIR);
    mcpServerManager.registerTool(BrowserHoverTool);
    mcpServerManager.registerTool(BrowserScrollTool);
    mcpServerManager.registerTool(BrowserClickTool);
    mcpServerManager.registerTool(BrowserFileUploadTool);
    mcpServerManager.registerTool(BrowserDownloadTool);
    mcpServerManager.registerTool(BrowserInputTool);

    const {
      BrowserExportStorageStateTool,
      BrowserImportStorageStateTool,
      BrowserGetLocalStorageTool,
      BrowserSetLocalStorageTool,
      BrowserClearLocalStorageTool,
    } = createBrowserLocalStorageTools(
      cli.browserStorageExportDir ?? DEFAULT_BROWSER_STORAGE_EXPORT_DIR,
    );
    mcpServerManager.registerTool(BrowserExportStorageStateTool);
    mcpServerManager.registerTool(BrowserImportStorageStateTool);
    mcpServerManager.registerTool(BrowserGetLocalStorageTool);
    mcpServerManager.registerTool(BrowserSetLocalStorageTool);
    mcpServerManager.registerTool(BrowserClearLocalStorageTool);

    const {
      BrowserNavigateToTool,
      BrowserForwardTool,
      BrowserBackTool,
    } = createBrowserNavigationTools();
    mcpServerManager.registerTool(BrowserNavigateToTool);
    mcpServerManager.registerTool(BrowserForwardTool);
    mcpServerManager.registerTool(BrowserBackTool);

    const {
      BrowserInteractivesScreenshotTool,
      BrowserElementScreenshotTool,
    } = createBrowserScreenshotTools(
      cli.browserScreenshotsDir ?? DEFAULT_BROWSER_SCREENSHOTS_DIR,
    );
    mcpServerManager.registerTool(BrowserInteractivesScreenshotTool);
    mcpServerManager.registerTool(BrowserElementScreenshotTool);

    const {
      BrowserOpenSessionTool,
      BrowserCloseSessionTool,
    } = createBrowserSessionTools();
    mcpServerManager.registerTool(BrowserOpenSessionTool);
    mcpServerManager.registerTool(BrowserCloseSessionTool);

    const {
      BrowserWaitTool,
      BrowserWaitForRequestTool,
      BrowserWaitForResponseTool,
    } = createBrowserWaitTools();
    mcpServerManager.registerTool(BrowserWaitTool);
    mcpServerManager.registerTool(BrowserWaitForRequestTool);
    mcpServerManager.registerTool(BrowserWaitForResponseTool);

    // Register web search tool
    mcpServerManager.registerTool(WebSearchTool);

    console.log(
      "🔧 Registered tools:",
      Array.from(mcpServerManager.getAllTools().keys()).join(", "),
    );

    await runAgentInTerminal(agent, modelToUse);
  } catch (error) {
    console.error("Fatal Error:", formatError(error));
    Deno.exit(1);
  }
}

// Handle Ctrl+C
Deno.addSignalListener("SIGINT", () => {
  console.log("\n\nGoodbye! 👋\n");
  Deno.exit(0);
});

// Run the CLI
main().catch((error) => {
  console.error("Unhandled error:", formatError(error));
  Deno.exit(1);
});
