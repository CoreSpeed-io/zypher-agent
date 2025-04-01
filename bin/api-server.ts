import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
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
} from "../src/tools";
import { listCheckpoints } from "../src/checkpoints";
import { formatError } from "../src/utils/error";

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

// Update task schema to match API spec
const taskSchema = z.object({
  task: z.string(),
  imageAttachments: z.array(imageSchema).optional(),
});

// Type inference from Zod schema
type TaskRequest = z.infer<typeof taskSchema>;

const checkpointParamsSchema = z.object({
  checkpointId: z.string().min(1, "Checkpoint ID cannot be empty"),
});

// Type inference from Zod schema
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

    // Initialize the agent with provided options
    agent = new ZypherAgent({
      userId: options.userId,
      baseUrl: options.baseUrl,
      anthropicApiKey: options.apiKey,
    });

    // Register all available tools
    agent.registerTool(ReadFileTool);
    agent.registerTool(ListDirTool);
    agent.registerTool(EditFileTool);
    agent.registerTool(RunTerminalCmdTool);
    agent.registerTool(GrepSearchTool);
    agent.registerTool(FileSearchTool);
    agent.registerTool(DeleteFileTool);

    console.log(
      "🔧 Registered tools:",
      Array.from(agent.tools.keys()).join(", "),
    );

    // Initialize the agent (load message history, generate system prompt)
    await agent.init();

    console.log("🤖 ZypherAgent initialized successfully");
  } catch (error) {
    console.error("Error initializing agent:", formatError(error));
    process.exit(1);
  }
}

function isBase64Image(data: string): boolean {
  try {
    const [header, base64Data] = data.split(",");

    if (!header || !base64Data) {
      return false;
    }

    const mimeType = header.split(":")[1]?.split(";")[0];
    return SUPPORTED_IMAGE_TYPES.includes(mimeType as SupportedImageType);
  } catch {
    return false;
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
    const { task, imageAttachments } = req.body;
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
      await agent.runTaskWithStreaming(task, streamHandler, processedImages);

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
