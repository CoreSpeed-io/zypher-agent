import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Command } from "commander";
import { ZypherAgent, type MessageHandler } from "../src/ZypherAgent";
import type { Message } from "../src/message";
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

// API Routes

// Health check endpoint
app.get("/health", [
  (req: Request, res: Response) => {
    const uptime = process.uptime();
    res.json({
      status: "ok",
      version: "1.0.0",
      uptime,
    });
  },
]);

// Get agent messages
app.get("/agent/messages", [
  (req: Request, res: Response) => {
    try {
      const messages = agent.getMessages();
      res.json(messages);
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: `Error retrieving messages: ${formatError(error)}`,
      });
    }
  },
]);

// Clear agent messages
app.delete("/agent/messages", [
  (req: Request, res: Response) => {
    try {
      agent.clearMessages();
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: `Error clearing messages: ${formatError(error)}`,
      });
    }
  },
]);

interface TaskRequest {
  task: string;
}

// Run a task
app.post("/agent/tasks", [
  async (req: Request<unknown, unknown, TaskRequest>, res: Response) => {
    try {
      const { task } = req.body;

      if (!task) {
        res.status(400).json({
          code: 400,
          message: "Task is required",
        });
        return;
      }

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
        // Set up event listeners for agent responses
        const messageHandler: MessageHandler = (message: Message) => {
          // Send message event - the user message already contains checkpoint info
          res.write(`event: message\n`);
          res.write(`data: ${JSON.stringify(message)}\n\n`);
        };

        // Run the task - the agent will create a checkpoint and handle all messages
        await agent.runTaskLoop(task, messageHandler);

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
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: `Error running task: ${formatError(error)}`,
      });
    }
  },
]);

// List checkpoints
app.get("/agent/checkpoints", [
  async (req: Request, res: Response) => {
    try {
      const checkpoints = await listCheckpoints();
      res.json(checkpoints);
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: `Error retrieving checkpoints: ${formatError(error)}`,
      });
    }
  },
]);

// Apply checkpoint
app.post("/agent/checkpoints/:checkpointId/apply", [
  async (req: Request<{ checkpointId: string }>, res: Response) => {
    try {
      const { checkpointId } = req.params;

      if (!checkpointId) {
        res.status(400).json({
          code: 400,
          message: "Checkpoint ID is required",
        });
        return;
      }

      // Use the agent's applyCheckpoint method to update both filesystem and message history
      await agent.applyCheckpoint(checkpointId);
      res.json({ success: true, id: checkpointId });
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: `Error applying checkpoint: ${formatError(error)}`,
      });
    }
  },
]);

// Start the server
async function startServer(): Promise<void> {
  await initializeAgent();

  app.listen(PORT, () => {
    console.log(`🚀 API server running at http://localhost:${PORT}`);
  });
}

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log("\n\nShutting down API server... 👋\n");
  process.exit(0);
});

// Start the server
void startServer();
