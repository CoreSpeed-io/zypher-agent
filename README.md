# Zypher Agent

A production-ready AI agent framework built on Deno, featuring streaming task
execution, checkpoint management, and extensible loop interceptors.

## Monorepo Structure

This project is organized as a monorepo with three packages:

- **[@corespeed/zypher](packages/core/)** - Core agent framework with streaming
  execution, checkpoint system, and MCP integration
- **[@corespeed/zypher-tools](packages/tools/)** - Official tool collection for
  file operations, search, terminal, and image generation
- **[@corespeed/zypher-cli](packages/cli/)** - Interactive command-line
  interface

## Quick Start

### Installation

```bash
# Install all packages
deno add @corespeed/zypher @corespeed/zypher-tools

# Or use the CLI directly
deno install -A -n zypher jsr:@corespeed/zypher-cli
```

### Using the CLI

```bash
# Run with Anthropic Claude
zypher --api-key=sk-ant-xxx

# Run with OpenAI
zypher --api-key=sk-xxx --provider=openai
```

### Using as a Library

```typescript
import {
  AnthropicModelProvider,
  createZypherContext,
  ZypherAgent,
} from "@corespeed/zypher";
import { ListDirTool, ReadFileTool } from "@corespeed/zypher-tools";

// Create context and agent
const context = await createZypherContext(Deno.cwd());
const provider = new AnthropicModelProvider({ apiKey: "your-key" });
const agent = new ZypherAgent(context, provider);

// Register tools
agent.mcp.registerTool(ReadFileTool);
agent.mcp.registerTool(ListDirTool);

// Execute task
const events$ = agent.executeTask(
  "Analyze the codebase",
  "claude-sonnet-4-20250514",
);

for await (const event of events$) {
  console.log(event);
}
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/corespeed/zypher-agent
cd zypher-agent

# The monorepo is ready to use with Deno's workspace feature
```

### Common Commands

```bash
# Run tests for all packages
deno task test

# Type check all packages
deno task checkall

# Build CLI binary
cd packages/cli && deno task compile

# Start CLI in development
cd packages/cli && deno task start -- --api-key=your-key
```

### Package-Specific Development

Each package has its own development commands:

```bash
# Core package
cd packages/core
deno task test         # Run tests
deno task checkall     # Lint, format, and type check

# Tools package
cd packages/tools
deno task test         # Run tests
deno task checkall     # Lint, format, and type check

# CLI package
cd packages/cli
deno task start        # Run CLI
deno task compile      # Build binary
```

## Architecture

### Core Components

- **ZypherAgent**: Main agent with streaming task execution
- **CheckpointManager**: Git-based state management
- **ModelProvider**: Abstraction for Anthropic and OpenAI
- **Loop Interceptors**: Extensible post-inference processing
- **MCP Integration**: Model Context Protocol support
- **Storage Services**: File attachment management with S3

### Loop Interceptor System

The framework provides an extensible interceptor system for customizing agent
behavior:

- **ToolExecutionInterceptor**: Executes LLM-requested tool calls
- **ErrorDetectionInterceptor**: Detects and handles code errors
- **MaxTokensInterceptor**: Auto-continues on token limit

Custom interceptors can be added to extend functionality.

## Publishing

Each package can be published independently:

```bash
# Publish to JSR
deno task publish:jsr

# Or publish individual packages
cd packages/core && deno publish
cd packages/tools && deno publish
cd packages/cli && deno publish
```

## Documentation

- [Core Package Documentation](packages/core/README.md)
- [Tools Package Documentation](packages/tools/README.md)
- [CLI Package Documentation](packages/cli/README.md)

## License

Apache-2.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
