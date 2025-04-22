import "jsr:@std/dotenv/load";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { upgradeWebSocket } from "hono/deno";
import { prettyJSON } from "hono/pretty-json";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import type { StatusCode } from "hono/utils/http-status";
import {
  type ImageAttachment as ZypherImageAttachment,
  type StreamHandler,
  ZypherAgent,
} from "../src/ZypherAgent.ts";
import { z } from "zod";
import { parseArgs } from "jsr:@std/cli";

import {
  DeleteFileTool,
  EditFileTool,
  FileSearchTool,
  GrepSearchTool,
  ImageGenTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
} from "../src/tools/index.ts";
import { listCheckpoints } from "../src/checkpoints.ts";
import { formatError } from "../src/utils/error.ts";
import {
  McpServerError,
  McpServerManager,
} from "../src/mcp/McpServerManager.ts";
import { McpServerConfigSchema, McpServerIdSchema } from "../src/mcp/types.ts";
import process from "node:process";

export class ApiError extends Error {
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
const mcpServerManager = new McpServerManager();

// Zod Schemas
// Define supported image MIME types with more precise validation
const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

// Zod schema for base64 image validation
const base64ImageSchema = z
  .string()
  .regex(/^data:image\/[a-zA-Z+]+;base64,/, "Invalid base64 image format")
  .refine(
    (data) => {
      const [header] = data.split(",");
      const mimeType = header?.split(":")[1]?.split(";")[0];
      return (
        mimeType &&
        SUPPORTED_IMAGE_TYPES.includes(mimeType as SupportedImageType)
      );
    },
    {
      message: `Image must be one of the following types: ${
        SUPPORTED_IMAGE_TYPES.join(", ")
      }`,
    },
  );

// Zod schema for image validation
const imageSchema = z.object({
  name: z.string(),
  data: base64ImageSchema,
});
type ImageAttachment = z.infer<typeof imageSchema>;

// Zod schema for task
const taskSchema = z.object({
  task: z.string(),
  imageAttachments: z.array(imageSchema).optional(),
});

const checkpointParamsSchema = z.object({
  checkpointId: z.string().min(1, "Checkpoint ID cannot be empty"),
});

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

const PORT = parseInt(options.port, 10);

// Initialize Hono app
const app = new Hono();

// Middleware (prettyJSON)
app.use("*", prettyJSON());

// Initialize the agent
let agent: ZypherAgent;

async function initializeAgent(): Promise<void> {
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
    Deno.exit(1);
  }
}

// Error handling middleware
app.onError((err, c) => {
  console.error(`Error processing request: ${formatError(err)}`);

  if (err instanceof ApiError) {
    c.status(err.statusCode as StatusCode);
    return c.json({
      code: err.statusCode,
      type: err.type,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof z.ZodError) {
    c.status(400);
    return c.json({
      code: 400,
      type: "invalid_request",
      message: "Validation error",
      details: err.errors,
    });
  }

  // Default to internal server error
  c.status(500);
  return c.json({
    code: 500,
    type: "internal_server_error",
    message: "Internal server error",
    error: formatError(err),
  });
});

// API Routes

// Health check endpoint
app.get("/health", (c) => {
  const uptime = process.uptime();
  return c.json({
    status: "ok",
    version: "1.0.0",
    uptime,
  });
});

// Get agent messages
app.get("/agent/messages", (c) => {
  const messages = agent.getMessages();
  return c.json(messages);
});

// Clear agent messages
app.delete("/agent/messages", (c) => {
  agent.clearMessages();
  return c.body(null, 204);
});

// Cancel the current task
app.get("/agent/task/cancel", (c) => {
  // Check if a task is running
  if (!agent.isTaskRunning) {
    throw new ApiError(
      404,
      "task_not_running",
      "No task was running to cancel",
    );
  }

  // Task is running, cancel it
  agent.cancelTask("user");
  console.log("Task cancellation requested by user via API");

  return c.json({
    success: true,
    message: "Task cancelled successfully",
    status: "idle",
  });
});

type TaskEvent = {
  event:
    | "content_delta"
    | "tool_use_delta"
    | "message"
    | "error"
    | "complete"
    | "cancelled";
  data: unknown;
  reason?: "user" | "timeout";
};

async function runAgentTask(
  task: string,
  imageAttachments: ZypherImageAttachment[],
  onEvent: (event: TaskEvent) => void,
): Promise<void> {
  // Set up streaming handler for the agent
  const streamHandler: StreamHandler = {
    onContent: (content, _isFirstChunk) => {
      onEvent({ event: "content_delta", data: { content } });
    },
    onToolUse: (name, partialInput) => {
      onEvent({ event: "tool_use_delta", data: { name, partialInput } });
    },
    onMessage: (message) => {
      onEvent({ event: "message", data: message });
    },
    onCancelled: (reason) => {
      // Create a user-friendly message based on the reason
      let message: string;
      switch (reason) {
        case "user":
          message = "Task was cancelled by user";
          break;
        case "timeout":
          message = `Task was cancelled due to timeout (${
            agent.taskTimeoutMs / 1000
          }s limit)`;
          break;
        default:
          message = "Task was cancelled";
      }

      onEvent({
        event: "cancelled",
        data: { message, reason },
      });

      console.log(`Task cancelled: ${message} (reason: ${reason})`);
    },
  };

  try {
    const messages = await agent.runTaskWithStreaming(
      task,
      streamHandler,
      imageAttachments,
    );

    // Empty messages array means task was cancelled
    if (messages.length === 0 && agent.cancellationReason) {
      // Cancellation was already handled by onCancelled
      return;
    }

    // Otherwise, task completed successfully
    onEvent({ event: "complete", data: {} });
  } catch (error) {
    // For any other errors, provide detailed error info for debugging
    console.error("Error running agent task:", formatError(error));

    onEvent({
      event: "error",
      data: {
        error: formatError(error),
      },
    });
  }
}

function processImages(images: ImageAttachment[]): ZypherImageAttachment[] {
  return images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.data.split(":")[1].split(";")[0] as SupportedImageType,
      data: img.data.split(",")[1],
    },
  }));
}

// Run a task
app.post("/agent/task/sse", zValidator("json", taskSchema), (c) => {
  const { task, imageAttachments } = c.req.valid("json");
  const processedImages: ZypherImageAttachment[] = imageAttachments
    ? processImages(imageAttachments)
    : [];

  return streamSSE(
    c,
    async (stream) => {
      // Below contains a workaround to ensure the complete event is sent.
      // This is needed because the connection might close before the complete event is sent.
      // TODO: Find a better solution.
      let taskCompleted = false;

      // Handle SSE connection closure
      c.req.raw.signal.addEventListener("abort", () => {
        console.log("SSE connection aborted");
        if (agent.isTaskRunning) {
          console.log("Cancelling task due to SSE connection closure");
          agent.cancelTask("user");
        }
      });

      // Pass event handlers during initialization
      await runAgentTask(task, processedImages, (event) => {
        if (event.event === "complete" || event.event === "cancelled") {
          taskCompleted = true;
        }
        void stream.writeSSE({
          event: event.event,
          data: JSON.stringify(
            typeof event.data === "object"
              ? { ...event.data, reason: event.reason }
              : { value: event.data, reason: event.reason },
          ),
        });
      });

      // If the complete event wasn't sent through the normal flow, send it now
      if (!taskCompleted) {
        void stream.writeSSE({
          event: "complete",
          data: JSON.stringify({}),
        });
      }

      // Add a small delay to ensure the event is sent before the stream closes
      await new Promise((resolve) => setTimeout(resolve, 100));
    },
  );
});

// Run a task (websocket)
app.get(
  "/agent/task/ws",
  upgradeWebSocket((_c) => {
    return {
      onMessage(event, ws) {
        const messageData = JSON.parse(event.data as string);
        const result = taskSchema.safeParse(messageData);
        if (!result.success) {
          ws.send(JSON.stringify({
            event: "error",
            data: {
              error: "Invalid request format",
              details: result.error.format(),
            },
          }));
          return;
        }

        const { task, imageAttachments } = result.data;
        const processedImages: ZypherImageAttachment[] = imageAttachments
          ? processImages(imageAttachments)
          : [];

        runAgentTask(task, processedImages, (event) => {
          // Only send if the WebSocket is still open
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
          }
        });
      },
      onClose() {
        console.log("WebSocket connection closed");
        // Cancel running task if WebSocket connection is closed
        if (agent.isTaskRunning) {
          console.log("Cancelling task due to WebSocket closure");
          agent.cancelTask("user");
        }
      },
      onError(error) {
        console.error("WebSocket error:", error);
        // Also cancel task on WebSocket error
        if (agent.isTaskRunning) {
          console.log("Cancelling task due to WebSocket error");
          agent.cancelTask("user");
        }
      },
    };
  }),
);

// List checkpoints
app.get("/agent/checkpoints", async (c) => {
  const checkpoints = await listCheckpoints();
  return c.json(checkpoints);
});

// Apply checkpoint
app.post(
  "/agent/checkpoints/:checkpointId/apply",
  zValidator("param", checkpointParamsSchema),
  async (c) => {
    const checkpointId = c.req.param("checkpointId");

    // Use the agent's applyCheckpoint method to update both filesystem and message history
    await agent.applyCheckpoint(checkpointId);
    return c.json({ success: true, id: checkpointId });
  },
);

// List registered MCP servers
app.get("/mcp/servers", (c) => {
  const servers = mcpServerManager.getAllServerWithTools();
  return c.json({ servers });
});

// Update server status
app.put(
  "/mcp/servers/:id/status",
  zValidator("json", z.object({ enabled: z.boolean() })),
  async (c) => {
    const id = McpServerIdSchema.parse(c.req.param("id"));
    const { enabled } = c.req.valid("json");
    await mcpServerManager.setServerStatus(id, enabled);
    return c.body(null, 204);
  },
);

// Register new MCP server
app.post("/mcp/register", zValidator("json", McpServerApiSchema), async (c) => {
  const servers = c.req.valid("json");
  try {
    await Promise.all(
      Object.entries(servers).map(
        ([name, config]) =>
          config && mcpServerManager.registerServer(name, config),
      ),
    );
  } catch (error) {
    if (error instanceof McpServerError && error.code === "already_exists") {
      throw new ApiError(409, error.code, error.message, error.details);
    }
    throw error;
  }
  return c.body(null, 201);
});

// Deregister MCP server
app.delete("/mcp/servers/:id", async (c) => {
  const id = McpServerIdSchema.parse(c.req.param("id"));
  await mcpServerManager.deregisterServer(id);
  return c.body(null, 204);
});

// Update MCP server configuration
app.put(
  "/mcp/servers/:id",
  zValidator("json", McpServerApiSchema),
  async (c) => {
    const id = c.req.param("id") ?? "";
    const config = c.req.valid("json")[id];
    if (!config) {
      throw new ApiError(
        400,
        "invalid_request",
        "Invalid server configuration",
      );
    }
    await mcpServerManager.updateServerConfig(id, config);
    return c.body(null, 204);
  },
);

// Query available tools from registered MCP servers
app.get("/mcp/tools", (c) => {
  const tools = Array.from(mcpServerManager.getAllTools().keys());
  return c.json({ tools });
});

// Reload MCP server configuration
app.get("/mcp/reload", async (c) => {
  await mcpServerManager.reloadConfig();
  return c.body(null, 200);
});

// Get server config
app.get("/mcp/servers/:id", (c) => {
  const id = McpServerIdSchema.parse(c.req.param("id"));
  const { enabled: _enabled, ...rest } = mcpServerManager.getServerConfig(id);
  return c.json({ [id]: rest });
});

// Middleware (CORS)
// This has to be placed at the very end, see: https://hono.dev/docs/helpers/websocket
app.use("*", cors());

// Start the server
async function startServer(): Promise<void> {
  await initializeAgent();

  try {
    const server = Deno.serve({ hostname: "::", port: PORT }, app.fetch);

    Deno.addSignalListener("SIGINT", () => {
      console.log("\n\nShutting down API server... 👋\n");
      void server.shutdown();
      Deno.exit(0);
    });
  } catch (error) {
    console.error(`❌ Failed to start server:`, formatError(error));
    Deno.exit(1);
  }
}

// Start the server
void startServer();
