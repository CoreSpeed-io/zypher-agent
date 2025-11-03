# Zypher Agent

**Production-ready AI agents that live in your applications**

[![Build](https://github.com/CoreSpeed-io/zypher-agent/actions/workflows/build.yml/badge.svg)](https://github.com/CoreSpeed-io/zypher-agent/actions/workflows/build.yml) [![JSR](https://jsr.io/badges/@corespeed/zypher)](https://jsr.io/badges/@corespeed/zypher)

## Features

- **Agent, Not Workflow**: Reactive loop where the agent dynamically decides next steps based on LLM reasoning.
- **Git-Based Checkpoints**: Track, review, and revert agent changes with built-in checkpoint management
- **Extensible Tool System**: Built-in tools for file operations, search, and terminal commands with support for custom tools
- **Model Context Protocol (MCP)**: Native support for MCP servers with OAuth authentication
- **Multi-Provider Support**: Works with Anthropic Claude and OpenAI GPT models through a unified interface
- **Loop Interceptor System**: Customize agent behavior with extensible post-inference interceptors
- **Production-Ready**: Configurable timeouts, concurrency protection, and comprehensive error handling

## Quick Start

### Installation

> [!NOTE]
> Support for npm coming soon. 

#### Using JSR

```bash
# In your Deno project: 
import { ZypherAgent } from "jsr:@corespeed/zypher@^0.4.2";
```

### SDK Usage

```typescript
import {
  ZypherAgent,
  createZypherContext,
  AnthropicModelProvider,
  ReadFileTool,
  EditFileTool,
} from "@corespeed/zypher";

// Initialize context and provider
const context = await createZypherContext("/path/to/workspace");
const provider = new AnthropicModelProvider({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
});

// Create agent
const agent = new ZypherAgent(context, provider);

// Register tools
agent.mcp.registerTool(ReadFileTool);
agent.mcp.registerTool(EditFileTool);

// Run task with streaming
const taskEvents = agent.runTask(
  "Implement authentication middleware",
  "claude-sonnet-4-20250514"
);

for await (const event of taskEvents) {
  if (event.type === "text") {
    console.log(event.content);
  }
}
```

## License

Licensed under the Apache License, Version 2.0. See [LICENSE.md](LICENSE.md) for details.

## Resources

- [Issue Tracker](https://github.com/CoreSpeed-io/zypher-agent/issues)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

Built with ♥️ by [CoreSpeed](https://corespeed.io)
