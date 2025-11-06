# @corespeed/zypher-cli

Interactive command-line interface for Zypher Agent with support for multiple
LLM providers and built-in tools.

## Features

- **Multi-Provider Support**: Works with Anthropic Claude and OpenAI models
- **Interactive Terminal**: Built-in terminal interface for agent interaction
- **Pre-configured Tools**: All standard tools pre-registered and ready to use
- **Environment Configuration**: Support for `.env` files
- **Flexible Options**: Customize API endpoints, working directories, and more

## Installation

### Global Installation

```bash
# Using Deno
deno install -A -n zypher jsr:@corespeed/zypher-cli

# Using npm
npm install -g @corespeed/zypher-cli
```

### Run Directly

```bash
# Using Deno
deno run -A jsr:@corespeed/zypher-cli --api-key=your-key

# Using npx
npx @corespeed/zypher-cli --api-key=your-key
```

## Usage

### Basic Usage

```bash
# With Anthropic Claude (default)
zypher --api-key=sk-ant-xxx

# With OpenAI
zypher --api-key=sk-xxx --provider=openai

# Specify model
zypher --api-key=sk-ant-xxx --model=claude-sonnet-4-20250514
```

### Command-Line Options

```
Options:
  -k, --api-key <apiKey>              Model provider API key (required)
  -m, --model <model>                 Model name
  -p, --provider <provider>           Model provider (anthropic|openai)
  -b, --base-url <baseUrl>            Custom API base URL
  -w, --workDir <directory>           Working directory for agent operations
  -u, --user-id <userId>              Custom user ID
  --openai-api-key <key>              OpenAI API key for image tools (when using Anthropic)
  --backup-dir <directory>            Directory to store file backups (default: ./.backup)
```

### Environment Variables

Create a `.env` file in your project:

```env
# Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-xxx

# OpenAI API Key (for image tools or primary provider)
OPENAI_API_KEY=sk-xxx

# Custom base URL (optional)
API_BASE_URL=https://api.example.com
```

Then run:

```bash
zypher --api-key=$ANTHROPIC_API_KEY
```

### Examples

#### Using Anthropic Claude with Image Tools

```bash
zypher \
  --api-key=sk-ant-xxx \
  --openai-api-key=sk-xxx \
  --model=claude-sonnet-4-20250514
```

#### Using OpenAI with Custom Working Directory

```bash
zypher \
  --api-key=sk-xxx \
  --provider=openai \
  --model=gpt-4o \
  --workDir=/path/to/project
```

#### Using Custom API Endpoint

```bash
zypher \
  --api-key=your-key \
  --base-url=https://custom-endpoint.example.com \
  --provider=openai
```

## Pre-configured Tools

The CLI comes with all standard tools pre-registered:

- **File Operations**: read, edit, list, copy, delete
- **Search**: grep search, file search
- **Terminal**: command execution
- **Images**: generation and editing (requires OpenAI API key)

## Development

### Build from Source

```bash
# Clone the repository
git clone https://github.com/corespeed/zypher-agent
cd zypher-agent

# Build the CLI
deno task compile

# Run the compiled binary
./dist/zypher --api-key=your-key
```

### Run in Development

```bash
# From the repository root
deno task start -- --api-key=your-key

# Or directly from the CLI package
cd packages/cli
deno task start -- --api-key=your-key
```

## Interactive Commands

Once the CLI is running, you can interact with the agent:

- Type your requests and press Enter
- Press Ctrl+C to exit
- The agent will execute tasks and show progress in real-time

## Troubleshooting

### API Key Issues

Make sure your API key is valid and has the correct prefix:

- Anthropic: `sk-ant-...`
- OpenAI: `sk-...`

### Permission Errors

The CLI needs all permissions to execute commands and access files. Run with
`-A` flag if using Deno directly.

### Model Not Found

Ensure you're using a valid model name for your provider:

- Anthropic: `claude-sonnet-4-20250514`, `claude-3-5-sonnet-20241022`, etc.
- OpenAI: `gpt-4o`, `gpt-4o-mini`, etc.

## License

Apache-2.0
