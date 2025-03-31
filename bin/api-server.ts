import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Command } from "commander";
import { ZypherAgent, type StreamHandler } from "../src/ZypherAgent";
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

type SupportedImageType = typeof SUPPORTED_IMAGE_TYPES[number];

// Zod schema for image validation
const imageAttachmentSchema = z.object({
  name: z.string()
    .min(1, "Image name cannot be empty")
    .max(255, "Image name is too long")
    .refine((name) => /^[\w\-. ]+$/.test(name), {
      message: "Image name contains invalid characters",
    }),
  data: z.string()
    .min(1, "Image data cannot be empty")
    .refine(
      (data) => {
        try {
          const [header, base64Data] = data.split(",");
          if (!header || !base64Data) return false;
          
          const mimeMatch = /^data:(image\/[\w-+.]+);base64$/.exec(header);
          if (!mimeMatch) return false;
          
          const mimeType = mimeMatch[1];
          if (!SUPPORTED_IMAGE_TYPES.includes(mimeType as SupportedImageType)) {
            return false;
          }
          
          const validBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(base64Data);
          return validBase64;
        } catch {
          return false;
        }
      },
      {
        message: `Invalid image format. Must be base64 encoded with MIME type (${SUPPORTED_IMAGE_TYPES.join(", ")})`,
      },
    ),
});

// Update task schema to match API spec
const taskSchema = z.object({
  task: z.string()
    .min(1, "Task description cannot be empty")
    .describe("The task description to send to the agent"),
  imageAttachments: z.array(imageAttachmentSchema)
    .optional()
    .describe("Image attachments for the task")
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

// Run a task
app.post(
  "/agent/tasks",
  validateRequest(taskSchema),
  async (req: Request<unknown, unknown, TaskRequest>, res: Response) => {
    const { task, imageAttachments } = req.body;

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Set up streaming handler
    const streamHandler: StreamHandler = {
      onContent: (content, _isFirstChunk) => {
        res.write(`event: content_delta\n`);
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      },
      onToolUse: (name, partialInput) => {
        res.write(`event: tool_use_delta\n`);
        res.write(`data: ${JSON.stringify({ name, partialInput })}\n\n`);
      },
      onMessage: (message) => {
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify(message)}\n\n`);
      },
    };

    try {
      // Process images if present
      const processedImages = imageAttachments?.map((img) => {
        // Extract base64 data and MIME type
        const [header = "", base64Data = ""] = img.data.split(",");
        const mimeMatch = /^data:(image\/[\w-+.]+);base64$/.exec(header);
        const mimeType = mimeMatch?.[1] ?? "image/png";
        
        if (!base64Data) {
          throw new ApiError(400, "invalid_request", "Invalid base64 image data");
        }
        
        // Return in Claude's expected format
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64Data
          }
        };
      }) ?? [];

      // Run the task with streaming handler
      await agent.runTaskWithStreaming(
        task,
        processedImages,
        streamHandler
      );

      // Send complete event
      res.write(`event: complete\n`);
      res.write(`data: {}\n\n`);
      res.end();
    } catch (error) {
      // Send error event
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
