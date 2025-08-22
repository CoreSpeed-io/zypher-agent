# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Development Commands

- **Start CLI**: `deno task start` - Launches the interactive CLI interface
- **Build**: `deno task compile` - Compiles the CLI to a binary at `dist/cli`
- **Test**: `deno task test` - Runs all tests with leak tracing
- **Test Watch**: `deno task test:watch` - Runs tests in watch mode
- **Type Check**: `deno check .` - Type checks the entire codebase
- **Lint**: `deno lint` - Lints the codebase
- **Format**: `deno fmt` - Formats the codebase
- **Check All**: `deno task checkall` - Runs format, lint, and type check in
  sequence
- **Build NPM**: `deno task build:npm` - Builds NPM distribution

## Architecture Overview

Zypher Agent is a Deno-based framework for building production-ready AI agents
with the following core components:

### Core Components

- **ZypherAgent** (`src/ZypherAgent.ts`): Main agent implementation with
  streaming task execution, checkpoint system, and event handling
- **ModelProvider** (`src/llm/`): Abstraction layer supporting Anthropic and
  OpenAI models
- **Tool System** (`src/tools/`): Built-in tools for file operations, terminal
  commands, and search
- **MCP Integration** (`src/mcp/`): Model Context Protocol client and server
  management with OAuth support
- **Storage Services** (`src/storage/`): File attachment management with S3
  support
- **Checkpoint System** (`src/checkpoints.ts`): Git-based state management for
  tracking and reverting changes

### Key Architecture Patterns

- **Event-driven**: Uses RxJS observables for streaming task events
- **Tool-based**: Extensible tool system with Zod schema validation
- **MCP Protocol**: Native support for Model Context Protocol servers
- **Storage abstraction**: Pluggable storage services for file attachments
- **Error detection**: Language-specific error detection for JavaScript, Python,
  and Go

### Directory Structure

- `src/` - Core TypeScript source code
- `bin/cli.ts` - CLI entry point
- `tests/` - Integration and unit tests
- `npm/` - Generated NPM distribution
- `scripts/` - Build and utility scripts

### Configuration

- `deno.json` - Deno configuration with tasks and import map
- `mcp.json` - MCP server configuration (currently empty)

### Testing

Uses Deno's built-in test runner with integration tests for MCP client and S3
storage.
