# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Development Commands

Root workspace commands (run from repo root):

- **Run CLI**: `deno task cli` - Runs the CLI from packages/cli
- **Test all**: `deno task test` - Runs all tests with leak tracing
- **Test watch**: `deno task test:watch` - Runs tests in watch mode
- **Check all**: `deno task checkall` - Runs format, lint, and type check

### Code quality

- **Type check**: `deno check .`
- **Lint**: `deno lint`
- **Format**: `deno fmt`

## Architecture Overview

Zypher Agent is a TypeScript SDK for building production-ready AI agents.
Published as `@zypher/agent` on JSR.

### Monorepo Structure

```
packages/
├── agent/          # Core SDK (@zypher/agent)
│   ├── src/        # Source code
│   └── tests/      # Tests
├── cli/            # CLI tool (@zypher/cli)
examples/
└── ptc/            # Programmatic Tool Calling example
```

### Core Components (packages/agent/src/)

- **ZypherAgent.ts**: Main agent class with reactive task execution loop. Uses
  RxJS Observable to stream TaskEvents. Manages message history, checkpoints,
  and coordinates with McpServerManager and LoopInterceptorManager.

- **factory.ts**: `createZypherAgent()` - simplified factory that creates
  context, registers tools, and connects MCP servers in one call.

- **llm/**: Model provider abstraction (`ModelProvider` interface) with
  implementations for Anthropic and OpenAI. Handles streaming chat completions
  and token usage tracking.

- **loopInterceptors/**: Chain of responsibility pattern for post-inference
  processing. Each interceptor can return `LoopDecision.CONTINUE` to continue
  the agent loop or `LoopDecision.COMPLETE` to finish.
  - `ToolExecutionInterceptor`: Executes tool calls from LLM responses
  - `MaxTokensInterceptor`: Auto-continues when response hits token limit
  - `ErrorDetectionInterceptor`: Detects errors and prompts for fixes

- **mcp/**: Model Context Protocol integration
  - `McpServerManager`: Manages MCP server lifecycle, tool registration, and
    tool execution with optional approval handlers
  - `McpClient`: Individual server connection with status observable
  - Supports CoreSpeed MCP Store registry for server discovery

- **tools/**: Extensible tool system using Zod schemas
  - `fs/`: File system tools (ReadFile, ListDir, EditFile, GrepSearch, etc.)
  - `codeExecutor/`: Programmatic Tool Calling (PTC) via `execute_code` tool
  - Use `createTool()` helper to define custom tools

- **CheckpointManager.ts**: Git-based workspace state snapshots. Creates a
  separate git repository in workspaceDataDir to track file changes without
  affecting the user's main repository.

- **TaskEvents.ts**: Discriminated union of all events emitted during task
  execution (text streaming, tool use, messages, usage, completion).

### Key Patterns

- **Event streaming**: `agent.runTask()` returns `Observable<TaskEvent>` for
  real-time updates
- **Tool approval**: Optional `ToolApprovalHandler` callback before tool
  execution
- **Context separation**: `ZypherContext` (workspace/directories) vs
  `ZypherAgentConfig` (behavioral settings)
- **MCP Server sources**: Registry (CoreSpeed MCP Store) or direct configuration

### Testing

Tests are in `packages/agent/tests/`. Integration tests require environment
variables (API keys, S3 credentials). Run a single test:

```bash
deno test -A packages/agent/tests/McpServerManager.test.ts
```
