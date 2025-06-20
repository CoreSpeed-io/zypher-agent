# @zypher/core

Core library for Zypher Agent - provides the main agent implementation, tools,
and utilities for building AI-powered coding assistants.

## Installation

This package is part of the Zypher Agent monorepo. To use it as a library in
your own project:

```typescript
// Import directly from the monorepo (after cloning)
import {
  McpServerManager,
  ZypherAgent,
} from "../path/to/zypher-agent/packages/core/mod.ts";
```

## Features

- 🤖 Main `ZypherAgent` class for task execution
- 🛠️ Extensible tool system
- 📝 Message history management
- 🔌 MCP (Model Context Protocol) integration
- 📤 Storage service abstraction (S3 implementation included)
- 🔍 Error detection for multiple programming languages
- ⏰ Task timeout and cancellation support
- 📊 Streaming responses with progress updates

## Usage

### Basic Example

```typescript
import { McpServerManager, ZypherAgent } from "@zypher/core";

// Initialize MCP server manager
const mcpServerManager = new McpServerManager();
await mcpServerManager.init();

// Create and initialize agent
const agent = new ZypherAgent(
  {
    anthropicApiKey: "your-api-key",
    persistHistory: true,
    autoErrorCheck: true,
    enablePromptCaching: true,
  },
  mcpServerManager,
);
await agent.init();

// Run a task
const messages = await agent.runTaskWithStreaming(
  "Create a TypeScript function that calculates fibonacci numbers",
  "claude-3-5-sonnet-20241022",
);
```

### With Streaming Updates

```typescript
const streamHandler = {
  onContent: (content, isFirstChunk) => {
    // Handle incremental content updates
    console.log(content);
  },
  onToolUse: (name, partialInput) => {
    // Handle tool usage updates
    console.log(`Using tool: ${name}`);
  },
  onMessage: (message) => {
    // Handle complete messages
    console.log(`New message: ${message.role}`);
  },
  onCancelled: (reason) => {
    // Handle cancellation
    console.log(`Task cancelled: ${reason}`);
  },
};

await agent.runTaskWithStreaming(
  "Refactor this code to use async/await",
  "claude-3-5-sonnet-20241022",
  streamHandler,
);
```

### With File Attachments

```typescript
import { S3StorageService } from "@zypher/core";

// Set up storage service
const storageService = new S3StorageService({
  bucket: "my-bucket",
  region: "us-east-1",
  credentials: {
    accessKeyId: "xxx",
    secretAccessKey: "yyy",
  },
});

// Create agent with storage
const agent = new ZypherAgent(config, mcpServerManager, storageService);
await agent.init();

// Get file attachment
const attachment = await agent.getFileAttachment("file-id-123");

// Run task with attachments
await agent.runTaskWithStreaming(
  "Analyze this image and describe what you see",
  "claude-3-5-sonnet-20241022",
  streamHandler,
  [attachment],
);
```

## Available Tools

The core package includes several built-in tools:

- `ReadFileTool` - Read file contents
- `EditFileTool` - Make targeted edits to files
- `ListDirTool` - List directory contents
- `RunTerminalCmdTool` - Execute terminal commands
- `GrepSearchTool` - Search files using grep
- `FileSearchTool` - Advanced file search with context
- `CopyFileTool` - Copy files
- `DeleteFileTool` - Delete files
- `ImageGenTool` - Generate images using AI
- `ImageEditTool` - Edit images using AI

### Registering Tools

```typescript
import { EditFileTool, ReadFileTool, RunTerminalCmdTool } from "@zypher/core";

// Register tools with the MCP server manager
mcpServerManager.registerTool(ReadFileTool);
mcpServerManager.registerTool(EditFileTool);
mcpServerManager.registerTool(RunTerminalCmdTool);
```

## Custom Tools

You can create custom tools by extending the base tool interface:

```typescript
import { Tool } from "@zypher/core";

const CustomTool: Tool = {
  name: "my_custom_tool",
  description: "Does something custom",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string", description: "Tool input" },
    },
    required: ["input"],
  },
  execute: async (params) => {
    // Tool implementation
    return `Processed: ${params.input}`;
  },
};

mcpServerManager.registerTool(CustomTool);
```

## API Reference

### ZypherAgent

Main agent class for executing tasks.

#### Constructor

```typescript
new ZypherAgent(
  config: ZypherAgentConfig,
  mcpServerManager: McpServerManager,
  storageService?: StorageService
)
```

#### Config Options

- `anthropicApiKey` - API key for Anthropic Claude
- `baseUrl` - Custom base URL for Anthropic API
- `maxTokens` - Maximum tokens per response (default: 8192)
- `persistHistory` - Save message history (default: true)
- `autoErrorCheck` - Automatically detect and fix code errors (default: true)
- `enablePromptCaching` - Enable prompt caching for better performance (default:
  true)
- `userId` - User ID for tracking usage
- `taskTimeoutMs` - Task timeout in milliseconds (default: 900000 / 15 minutes)
- `fileAttachmentCacheDir` - Directory for caching file attachments

#### Methods

- `init()` - Initialize the agent
- `runTaskWithStreaming()` - Execute a task with streaming updates
- `clearMessages()` - Clear message history
- `applyCheckpoint()` - Apply a checkpoint to revert changes
- `wait()` - Wait for the current task to complete

### McpServerManager

Manages MCP servers and tools.

- `init()` - Initialize the manager
- `registerTool()` - Register a new tool
- `getTool()` - Get a tool by name
- `getAllTools()` - Get all registered tools

## Testing

```bash
# Run tests for the core package
deno task -c packages/core/deno.json test
```

## License

Proprietary - All rights reserved
