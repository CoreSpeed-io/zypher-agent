import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Command } from "commander";
import { ZypherAgent, type StreamHandler } from "../src/ZypherAgent";
import { z } from "zod";
import { debounce } from "lodash";

import {
  ReadFileTool,
  ListDirTool,
  EditFileTool,
  RunTerminalCmdTool,
  GrepSearchTool,
  FileSearchTool,
  DeleteFileTool,
  ImageGenTool,
} from "../src/tools";
import { listCheckpoints } from "../src/checkpoints";
import { formatError } from "../src/utils/error";
import { McpServerManager } from "../src/mcp/McpServerManager";
import { McpServerConfigSchema, type IMcpServer } from "../src/mcp/types";

// Load environment variables
dotenv.config();

class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly type: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Schema for request validation
const McpServerApiSchema = z.record(z.string(), McpServerConfigSchema);

// Initialize MCP Server Manager
const mcpServerManager = McpServerManager.getInstance();

// Zod Schemas
const taskSchema = z.object({
  task: z.string().min(1, "Task cannot be empty"),
});

const checkpointParamsSchema = z.object({
  checkpointId: z.string().min(1, "Checkpoint ID cannot be empty"),
});

// Type inference from Zod schema
type TaskRequest = z.infer<typeof taskSchema>;
type CheckpointParams = z.infer<typeof checkpointParamsSchema>;

// Error handling middleware
const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  console.error(`Error processing request: ${formatError(err)}`);

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      code: err.statusCode,
      type: err.type,
      message: err.message,
      details: err.details,
    });
    return;
  }

  if (err instanceof z.ZodError) {
    res.status(400).json({
      code: 400,
      type: "invalid_request",
      message: "Validation error",
      details: err.errors,
    });
    return;
  }

  // Default to internal server error
  res.status(500).json({
    code: 500,
    type: "internal_server_error",
    message: "Internal server error",
    error: formatError(err),
  });
};

// Validation middleware
const validateRequest = <T>(schema: z.ZodType<T>) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    schema.parse(req.body);
    next();
  };
};

const validateParams = <T>(schema: z.ZodType<T>) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    schema.parse(req.params);
    next();
  };
};

interface ServerOptions {
  port: string;
  workspace?: string;
  userId?: string;
  baseUrl?: string;
  apiKey?: string;
}

const program = new Command();

program
  .name("zypher-api")
  .description("API server for ZypherAgent")
  .version("1.0.0")
  .option("-p, --port <number>", "Port to run the server on", "3000")
  .option("-w, --workspace <path>", "Set working directory for the agent")
  .option(
    "-u, --user-id <string>",
    "Set the user identifier (overrides ZYPHER_USER_ID env variable)",
  )
  .option(
    "-b, --base-url <string>",
    "Set the Anthropic API base URL (overrides ANTHROPIC_BASE_URL env variable)",
  )
  .option(
    "-k, --api-key <string>",
    "Set the Anthropic API key (overrides ANTHROPIC_API_KEY env variable)",
  )
  .parse(process.argv);

const options = program.opts<ServerOptions>();
const PORT = parseInt(options.port, 10);

// Initialize Express app
const app = express();
app.use(express.json());
app.use(cors());

// Initialize the agent
let agent: ZypherAgent;

async function initializeAgent(): Promise<void> {
  try {
    // Handle workspace option
    if (options.workspace) {
      try {
        process.chdir(options.workspace);
        console.log(`🚀 Changed working directory to: ${process.cwd()}`);
      } catch (error) {
        throw new Error(
          `Failed to change to workspace directory: ${formatError(error)}`,
        );
      }
    }
    await mcpServerManager.init();

    // Initialize the agent with provided options
    agent = new ZypherAgent(
      {
        userId: options.userId,
        baseUrl: options.baseUrl,
        anthropicApiKey: options.apiKey,
      },
      mcpServerManager,
    );

    // Register all available tools
    mcpServerManager.registerTool(ReadFileTool);
    mcpServerManager.registerTool(ListDirTool);
    mcpServerManager.registerTool(EditFileTool);
    mcpServerManager.registerTool(RunTerminalCmdTool);
    mcpServerManager.registerTool(GrepSearchTool);
    mcpServerManager.registerTool(FileSearchTool);
    mcpServerManager.registerTool(DeleteFileTool);
    mcpServerManager.registerTool(ImageGenTool);

    console.log(
      "🔧 Registered tools:",
      Array.from(mcpServerManager.getAllTools().keys()).join(", "),
    );

    // Initialize the agent (load message history, generate system prompt)
    await agent.init();

    console.log("🤖 ZypherAgent initialized successfully");
  } catch (error) {
    console.error("Error initializing agent:", formatError(error));
    process.exit(1);
  }
}

// API Routes

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  const uptime = process.uptime();
  res.json({
    status: "ok",
    version: "1.0.0",
    uptime,
  });
});

// Get agent messages
app.get("/agent/messages", (_req: Request, res: Response) => {
  const messages = agent.getMessages();
  res.json(messages);
});

// Clear agent messages
app.delete("/agent/messages", (_req: Request, res: Response) => {
  agent.clearMessages();
  res.status(204).send();
});

// Run a task
app.post(
  "/agent/tasks",
  validateRequest(taskSchema),
  async (req: Request<unknown, unknown, TaskRequest>, res: Response) => {
    const { task } = req.body;

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Set up streaming handler for both messages and real-time updates
    const streamHandler: StreamHandler = {
      onContent: (content, _isFirstChunk) => {
        // Send content_delta event for real-time content updates
        res.write(`event: content_delta\n`);
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      },
      onToolUse: (name, partialInput) => {
        // Send tool_use event for real-time tool use updates
        res.write(`event: tool_use_delta\n`);
        res.write(`data: ${JSON.stringify({ name, partialInput })}\n\n`);
      },
      onMessage: (message) => {
        // Send message event as soon as a complete message is available
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify(message)}\n\n`);
      },
    };

    try {
      // Run the task with streaming handler
      await agent.runTaskWithStreaming(task, streamHandler);

      // After streaming is complete, send the complete event
      // No need to send all messages again since they've been sent via onMessage
      res.write(`event: complete\n`);
      res.write(`data: {}\n\n`);

      // End the response
      res.end();
    } catch (error) {
      // Send error event directly in the stream
      res.write(`event: error\n`);
      res.write(`data: {"error": "${formatError(error)}"}\n\n`);
      res.end();
    }
  },
);

// List checkpoints
app.get("/agent/checkpoints", async (_req: Request, res: Response) => {
  const checkpoints = await listCheckpoints();
  res.json(checkpoints);
});

// Apply checkpoint
app.post(
  "/agent/checkpoints/:checkpointId/apply",
  validateParams(checkpointParamsSchema),
  async (req: Request<CheckpointParams>, res: Response) => {
    const { checkpointId } = req.params;

    // Use the agent's applyCheckpoint method to update both filesystem and message history
    await agent.applyCheckpoint(checkpointId);
    res.json({ success: true, id: checkpointId });
  },
);

// Register error handling middleware last
app.use(errorHandler);

// List registered MCP servers
app.get("/mcp/servers", (req: Request, res: Response) => {
  try {
    const servers = Array.from(mcpServerManager.getAllServers().entries()).map(
      ([id, server]: [string, IMcpServer]) => ({
        id,
        name: server.name,
        config: server.config,
      }),
    );
    res.json({ servers });
  } catch {
    res.status(500).json({ error: "Failed to list MCP servers" });
  }
});

// Register new MCP server
app.post("/mcp/register", async (req: Request, res: Response) => {
  try {
    const servers = McpServerApiSchema.parse(req.body);
    await Promise.all(
      Object.entries(servers).map(
        ([name, config]) =>
          config && mcpServerManager.registerServer(name, config),
      ),
    );
    res.status(201).json({ message: "Servers registered successfully" });
  } catch (error: unknown) {
    console.error(
      "Error registering MCP servers:",
      error instanceof Error ? formatError(error.stack) : error,
    );
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: "Invalid request data",
        details: error.errors,
      });
      return;
    }
    res.status(500).json({ error: "Failed to register MCP servers" });
  }
});

// Deregister MCP server
app.delete("/mcp/servers/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "Server ID is required" });
      return;
    }
    await mcpServerManager.deregisterServer(id);
    res.json({ message: "Server deregistered successfully" });
  } catch {
    res.status(500).json({ error: "Failed to deregister MCP server" });
  }
});

// Update MCP server configuration
app.put("/mcp/servers/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id ?? "";
    const config = McpServerApiSchema.parse(req.body)[id];
    if (!config) {
      res.status(400).json({ error: "Server configuration is required" });
      return;
    }
    await mcpServerManager.updateServerConfig(id, config);
    res.json({ message: "Server configuration updated successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: "Invalid request data",
        details: error.errors,
      });
      return;
    }
    res
      .status(500)
      .json({ error: "Failed to update MCP server configuration" });
  }
});

// Query available tools from registered MCP servers
app.get("/mcp/tools", (req: Request, res: Response) => {
  try {
    const tools = Array.from(mcpServerManager.getAllTools().values());
    res.json({ tools });
  } catch {
    res.status(500).json({ error: "Failed to query MCP tools" });
  }
});

app.get("/mcp/reload", async (req: Request, res: Response) => {
  try {
    const debouncedReload = debounce(
      async (): Promise<void> => {
        try {
          await mcpServerManager.reloadConfig();
        } catch (error) {
          console.error("Failed to reload MCP servers:", error);
        }
      },
      5000,
      { leading: true, trailing: false },
    );
    await debouncedReload();
    res.json({ message: "MCP servers reloaded successfully" });
  } catch {
    res.status(500).json({ error: "Failed to reload MCP servers" });
  }
});

// Start the server
async function startServer(): Promise<void> {
  await initializeAgent();

  try {
    const server = app.listen(PORT, () => {
      console.log(`🚀 API server running at http://localhost:${PORT}`);
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `❌ Error: Port ${PORT} is already in use. Please try a different port.`,
        );
        process.exit(1);
      } else {
        console.error(`❌ Server error:`, formatError(error));
        process.exit(1);
      }
    });
  } catch (error) {
    console.error(`❌ Failed to start server:`, formatError(error));
    process.exit(1);
  }
}

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log("\n\nShutting down API server... 👋\n");
  process.exit(0);
});

// Start the server
void startServer();
