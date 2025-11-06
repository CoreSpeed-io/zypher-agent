# @corespeed/zypher

The core Zypher Agent framework for building production-ready AI agents with
streaming task execution, checkpoint management, and extensible loop
interceptors.

## Features

- **Streaming Task Execution**: Real-time event-driven agent execution using
  RxJS observables
- **Checkpoint System**: Git-based state management for tracking and reverting
  changes
- **Loop Interceptors**: Extensible post-inference interceptor system for
  customizing agent behavior
- **Multi-Provider Support**: Built-in support for Anthropic and OpenAI models
- **MCP Integration**: Native Model Context Protocol client and server
  management with OAuth support
- **Storage Services**: Pluggable storage abstraction with S3 support for file
  attachments

## Installation

```bash
deno add @corespeed/zypher
```

Or with npm:

```bash
npm install @corespeed/zypher
```

## Quick Start

```typescript
import {
  AnthropicModelProvider,
  createZypherContext,
  ZypherAgent,
} from "@corespeed/zypher";

// Create a context for the agent
const context = await createZypherContext(
  Deno.cwd(),
  { userId: "user-123" },
);

// Initialize model provider
const provider = new AnthropicModelProvider({
  apiKey: "your-api-key",
});

// Create agent
const agent = new ZypherAgent(context, provider);

// Execute a task
const events$ = agent.executeTask(
  "Analyze the codebase and suggest improvements",
  "claude-sonnet-4-20250514",
);

// Subscribe to events
for await (const event of events$) {
  console.log(event);
}
```

## Architecture

### Core Components

- **ZypherAgent**: Main agent implementation with streaming execution
- **CheckpointManager**: Git-based state management system
- **ModelProvider**: Abstraction layer for LLM providers (Anthropic, OpenAI)
- **Loop Interceptors**: Post-inference processing chain
- **MCP Integration**: Model Context Protocol client/server management
- **Storage Services**: File attachment management with S3 support

### Subpath Exports

```typescript
// Core exports
import { ZypherAgent } from "@corespeed/zypher";

// LLM providers
import {
  AnthropicModelProvider,
  OpenAIModelProvider,
} from "@corespeed/zypher/llm";

// MCP functionality
import { MCPServerManager } from "@corespeed/zypher/mcp";

// Storage services
import { S3StorageService } from "@corespeed/zypher/storage";

// Loop interceptors
import { ToolExecutionInterceptor } from "@corespeed/zypher/interceptors";

// Utilities
import { formatError } from "@corespeed/zypher/utils";
```

## Loop Interceptor System

Loop interceptors provide extensible post-inference processing. Built-in
interceptors include:

- **ToolExecutionInterceptor**: Executes LLM-requested tool calls
- **ErrorDetectionInterceptor**: Detects and handles code errors
- **MaxTokensInterceptor**: Auto-continues when response truncated

Custom interceptors can be added to extend agent behavior.

## License

Apache-2.0
