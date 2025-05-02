// The jsr specifier here is a workaround for deno rolldown plugin
import "jsr:@std/dotenv/load";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { ZypherAgent } from "../../../src/ZypherAgent.ts";
import { parseArgs } from "@std/cli";

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
} from "../../../src/tools/mod.ts";
import { formatError } from "../../../src/error.ts";
import { McpServerManager } from "../../../src/mcp/McpServerManager.ts";
import process from "node:process";
import { createMcpRouter } from "./routes/mcp.ts";
import { createAgentRouter } from "./routes/agent.ts";
import { createFilesRouter } from "./routes/files.ts";
import { errorHandler } from "./error.ts";
import { parsePort } from "./utils.ts";
import { S3StorageService } from "../../../src/storage/S3StorageService.ts";
import { StorageService } from "../../../src/storage/StorageService.ts";

interface ServerOptions {
  port: string;
  workspace?: string;
  userId?: string;
  baseUrl?: string;
  apiKey?: string;
}

// Parse command line arguments using std/cli
const cliFlags = parseArgs(Deno.args, {
  string: ["port", "workspace", "user-id", "base-url", "api-key"],
  alias: {
    p: "port",
    w: "workspace",
    u: "user-id",
    b: "base-url",
    k: "api-key",
  },
  default: {
    port: "3000",
  },
});

// Convert kebab-case args to camelCase for consistency
const options: ServerOptions = {
  port: cliFlags.port,
  workspace: cliFlags.workspace,
  userId: cliFlags["user-id"],
  baseUrl: cliFlags["base-url"],
  apiKey: cliFlags["api-key"],
};

// Initialize Hono app
const app = new Hono();
const mcpServerManager = new McpServerManager();
const storageService: StorageService = new S3StorageService({
  bucket: Deno.env.get("S3_BUCKET_NAME") ?? "zypher-storage",
  region: Deno.env.get("S3_REGION") ?? "us-east-1",
  credentials: {
    accessKeyId: Deno.env.get("S3_ACCESS_KEY_ID") ?? "",
    secretAccessKey: Deno.env.get("S3_SECRET_ACCESS_KEY") ?? "",
  },
  endpoint: Deno.env.get("S3_ENDPOINT"),
});

// Validate S3 credentials are provided
if (
  !Deno.env.get("S3_ACCESS_KEY_ID") || !Deno.env.get("S3_SECRET_ACCESS_KEY")
) {
  console.warn(
    "⚠️ S3 credentials not provided. Storage service may not function correctly.",
  );
}

// Middleware (prettyJSON)
app.use("*", prettyJSON());

async function initializeAgent(): Promise<ZypherAgent> {
  try {
    // Handle workspace option
    if (options.workspace) {
      try {
        Deno.chdir(options.workspace);
        console.log(`🚀 Changed working directory to: ${Deno.cwd()}`);
      } catch (error) {
        throw new Error(
          `Failed to change to workspace directory: ${formatError(error)}`,
        );
      }
    }
    await mcpServerManager.init();

    // Initialize the agent with provided options
    const agent = new ZypherAgent(
      {
        userId: options.userId,
        baseUrl: options.baseUrl,
        anthropicApiKey: options.apiKey,
      },
      mcpServerManager,
      storageService,
    );

    // Register all available tools
    mcpServerManager.registerTool(ReadFileTool);
    mcpServerManager.registerTool(ListDirTool);
    mcpServerManager.registerTool(EditFileTool);
    mcpServerManager.registerTool(RunTerminalCmdTool);
    mcpServerManager.registerTool(GrepSearchTool);
    mcpServerManager.registerTool(FileSearchTool);
    mcpServerManager.registerTool(CopyFileTool);
    mcpServerManager.registerTool(DeleteFileTool);
    mcpServerManager.registerTool(ImageGenTool);
    mcpServerManager.registerTool(ImageEditTool);

    console.log(
      "🔧 Registered tools:",
      Array.from(mcpServerManager.getAllTools().keys()).join(", "),
    );

    // Initialize the agent (load message history, generate system prompt)
    await agent.init();

    console.log("🤖 ZypherAgent initialized successfully");
    return agent;
  } catch (error) {
    console.error("Error initializing agent:", formatError(error));
    Deno.exit(1);
  }
}

const agent = await initializeAgent();

// Error handling middleware
app.onError(errorHandler);

// Health check endpoint
app.get("/health", (c) => {
  const uptime = process.uptime();
  return c.json({
    status: "ok",
    version: "1.0.0",
    uptime,
  });
});

// API Routes
app.route("/agent", createAgentRouter(agent));
app.route("/files", createFilesRouter(storageService));
app.route("/mcp", createMcpRouter(mcpServerManager));

// Middleware (CORS)
// This has to be placed at the very end, see: https://hono.dev/docs/helpers/websocket
app.use("*", cors());

const server = Deno.serve({
  hostname: "::",
  port: parsePort(options.port, 4000),
}, app.fetch);

Deno.addSignalListener("SIGINT", () => {
  console.log("\n\nShutting down API server... 👋\n");
  void server.shutdown();
  Deno.exit(0);
});
