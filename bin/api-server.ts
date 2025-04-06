import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import type { StatusCode } from "hono/utils/http-status";
import dotenv from "dotenv";
import { Command } from "commander";
import {
  ZypherAgent,
  type StreamHandler,
  type ImageAttachment,
} from "../src/ZypherAgent";
import { z } from "zod";

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
import McpServerController from "../src/mcp/McpServerController";
import { McpServerConfigSchema, McpServerIdSchema } from "../src/mcp/types";

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

// Initialize MCP Server Manager and Controller
const mcpServerManager = new McpServerManager();
const mcpServerController = new McpServerController(mcpServerManager);

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
      message: `Image must be one of the following types: ${SUPPORTED_IMAGE_TYPES.join(", ")}`,
    },
  );

// Zod schema for image validation
const imageSchema = z.object({
  name: z.string(),
  data: base64ImageSchema,
});

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

// Initialize Hono app
const app = new Hono();

// Middleware
app.use("*", cors());
app.use("*", prettyJSON());

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
    mcpServerController.registerTool(ReadFileTool);
    mcpServerController.registerTool(ListDirTool);
    mcpServerController.registerTool(EditFileTool);
    mcpServerController.registerTool(RunTerminalCmdTool);
    mcpServerController.registerTool(GrepSearchTool);
    mcpServerController.registerTool(FileSearchTool);
    mcpServerController.registerTool(DeleteFileTool);
    mcpServerController.registerTool(ImageGenTool);

    console.log(
      "🔧 Registered tools:",
      mcpServerController.getAvailableTools().join(", "),
    );

    // Initialize the agent (load message history, generate system prompt)
    await agent.init();

    console.log("🤖 ZypherAgent initialized successfully");
  } catch (error) {
    console.error("Error initializing agent:", formatError(error));
    process.exit(1);
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

// Run a task
app.post("/agent/tasks", zValidator("json", taskSchema), (c) => {
  const { task, imageAttachments } = c.req.valid("json");
  const processedImages: ImageAttachment[] = [];

  if (imageAttachments?.length) {
    for (const img of imageAttachments) {
      const [, base64Data = ""] = img.data.split(",");
      const mimeType = img.data
        .split(":")[1]
        ?.split(";")[0] as SupportedImageType;
      processedImages.push({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mimeType,
          data: base64Data,
        },
      });
    }
  }

  return streamSSE(
    c,
    async (stream) => {
      // Set up streaming handler for both messages and real-time updates
      const streamHandler: StreamHandler = {
        onContent: (content, _isFirstChunk) => {
          // Send content_delta event for real-time content updates
          void stream.writeSSE({
            event: "content_delta",
            data: JSON.stringify({ content }),
          });
        },
        onToolUse: (name, partialInput) => {
          // Send tool_use event for real-time tool use updates
          void stream.writeSSE({
            event: "tool_use_delta",
            data: JSON.stringify({ name, partialInput }),
          });
        },
        onMessage: (message) => {
          // Send message event as soon as a complete message is available
          void stream.writeSSE({
            event: "message",
            data: JSON.stringify(message),
          });
        },
      };

      // Run the task with streaming handler
      await agent.runTaskWithStreaming(task, streamHandler, processedImages);

      // After streaming is complete, send the complete event
      await stream.writeSSE({
        event: "complete",
        data: JSON.stringify({}),
      });
    },
    async (err, stream) => {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: formatError(err) }),
      });
    },
  );
});

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
  const servers = mcpServerController.getServersWithTools();
  return c.json({ servers });
});

// Get server status
app.get("/mcp/servers/:id/status", (c) => {
  const id = McpServerIdSchema.parse(c.req.param("id"));
  const enabled = mcpServerController.getServerStatus(id);
  return c.json({ enabled });
});

// Update server status
app.put(
  "/mcp/servers/:id/status",
  zValidator("json", z.object({ enabled: z.boolean() })),
  async (c) => {
    const id = McpServerIdSchema.parse(c.req.param("id"));
    const { enabled } = c.req.valid("json");
    await mcpServerController.setServerStatus(id, enabled);
    return c.body(null, 204);
  },
);

// Register new MCP server
app.post("/mcp/register", zValidator("json", McpServerApiSchema), async (c) => {
  const servers = c.req.valid("json");
  await Promise.all(
    Object.entries(servers).map(
      ([name, config]) =>
        config && mcpServerController.registerServer(name, config),
    ),
  );
  return c.body(null, 201);
});

// Deregister MCP server
app.delete("/mcp/servers/:id", async (c) => {
  const id = McpServerIdSchema.parse(c.req.param("id"));
  await mcpServerController.deregisterServer(id);
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
    await mcpServerController.updateServerConfig(id, config);
    return c.body(null, 204);
  },
);

// Query available tools from registered MCP servers
app.get("/mcp/tools", (c) => {
  const tools = mcpServerController.getAvailableTools();
  return c.json({ tools });
});

// Reload MCP server configuration
app.get("/mcp/reload", async (c) => {
  await mcpServerController.reloadConfig();
  return c.body(null, 200);
});

// Get server config
app.get("/mcp/servers/:id/config", (c) => {
  const id = McpServerIdSchema.parse(c.req.param("id"));
  const config = mcpServerController.getServerConfig(id);
  return c.json({ config });
});

// Start the server
async function startServer(): Promise<void> {
  await initializeAgent();

  try {
    const server = Bun.serve({
      port: PORT,
      fetch: app.fetch,
      idleTimeout: 180,
    });

    console.log(`🚀 API server running at http://localhost:${PORT}`);

    process.on("SIGINT", () => {
      console.log("\n\nShutting down API server... 👋\n");
      void server.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error(`❌ Failed to start server:`, formatError(error));
    process.exit(1);
  }
}

// Start the server
void startServer();
