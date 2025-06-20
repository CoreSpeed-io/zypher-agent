# Zypher Agent

An AI-powered coding assistant that helps you with code editing, file
management, and development tasks through natural language interaction.

## 📦 Monorepo Structure

This project is organized as a Deno workspace monorepo with the following
packages:

| Package                             | Description                                                      |
| ----------------------------------- | ---------------------------------------------------------------- |
| [@zypher/core](./packages/core)     | Core library with the agent implementation, tools, and utilities |
| [@zypher/cli](./packages/cli)       | Interactive command-line interface                               |
| [@zypher/server](./packages/server) | RESTful API server for integrations                              |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/CoreSpeed-io/zypher-agent.git && cd zypher-agent

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and configuration

# Start the CLI
deno task start:cli

# Or start the API server
deno task start:server
```

## Features

- 🤖 Interactive CLI interface for natural language coding tasks
- 🌐 RESTful API server for integration with other applications
- ✨ Smart code editing with multi-file support
- 📁 File and directory management
- 🔍 Semantic code search
- 🛠️ Extensible tool system
- 📝 Checkpoint system for tracking and reverting changes
- 🔌 MCP (Model Context Protocol) support
- 📤 S3 storage integration for file attachments

## Documentation

- [CLI Documentation](./packages/cli/README.md) - Learn how to use the
  command-line interface
- [API Server Documentation](./packages/server/README.md) - Integrate Zypher
  Agent into your applications
- [Core Library Documentation](./packages/core/README.md) - Build custom
  implementations with the core library

## License

Proprietary - All rights reserved
