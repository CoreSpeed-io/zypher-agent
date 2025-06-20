# @zypher/cli

Interactive command-line interface for Zypher Agent.

## Installation

This package is part of the Zypher Agent monorepo. To use the CLI:

```bash
# From the repository root
deno task start:cli

# Or directly from this package
deno task -c packages/cli/deno.json start
```

To build a standalone executable:

```bash
# Build the CLI executable
deno task build:cli
```

## Usage

### Basic Usage

Start the CLI, and you will see the interactive prompt:

```
🤖 Welcome to Zypher Agent CLI!

Type your task or command below. Use "exit" or Ctrl+C to quit.

🔧 Enter your task:
```

### Command-Line Options

```bash
# Specify a workspace directory
deno task start -- -w /path/to/your/project
# or
deno task start -- --workspace /path/to/your/project
```

### Example Tasks

```
🔧 Enter your task: Create a TypeScript function that validates email addresses

🔧 Enter your task: Refactor this code to use modern JavaScript features

🔧 Enter your task: Add error handling to all API endpoints

🔧 Enter your task: Write unit tests for the authentication module

🔧 Enter your task: Explain how this React component works
```

### Supported Tools

The CLI automatically registers these tools:

- **File Operations**: Read, edit, copy, delete files
- **Directory Navigation**: List directory contents
- **Terminal Commands**: Execute shell commands
- **Search**: Search files using grep or advanced search
- **Image Generation**: Create and edit images using AI

## Development

```bash
# Run the CLI in development mode
deno run -A packages/cli/src/main.ts

# Build the executable
deno task -c packages/cli/deno.json build

# Or bundling
deno task -c packages/cli/deno.json bundle
```
