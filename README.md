# Zypher Agent

An AI-powered coding assistant that helps you with code editing, file management, and development tasks through natural language interaction.

## Features

- 🤖 Interactive CLI interface for natural language coding tasks
- 🌐 RESTful API server for integration with other applications
- ✨ Smart code editing
- 📁 File and directory management
- 🔍 Semantic code search
- 🛠️ Multiple tool integrations
- 📝 Checkpoint system for tracking and reverting changes

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/zypher-agent.git
cd zypher-agent

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and configuration
```

## Usage

### CLI

Start the CLI:

```bash
bun start
```

Or specify a workspace directory:

```bash
bun start -w /path/to/your/project
```

### API Server

Start the API server:

```bash
bun start:api
```

Configuration options:

```bash
# Set the port (default: 3000)
bun start:api -p 8080

# Set the workspace directory
bun start:api -w /path/to/your/project
```

## API Documentation

The API server provides the following endpoints:

- `GET /health` - Health check
- `GET /agent/messages` - Get all messages in the agent's history
- `DELETE /agent/messages` - Clear all messages in the agent's history
- `POST /agent/tasks` - Run a task using the agent (SSE endpoint)
- `GET /agent/checkpoints` - List all available checkpoints
- `POST /agent/checkpoints/{checkpointId}/apply` - Apply a checkpoint

See the [API Specification](./api-spec.yaml) for detailed documentation.

## Development

### Local Development

```bash
# Run tests
bun test

# Type checking
bun type-check

# Linting
bun lint

# Format code
bun lint:fix
```

### Docker Development (Recommended)

Basic usage:

```bash
# Build the image
docker build -t zypher-agent .

# Start the agent
docker run -it --rm zypher-agent
```

For development/debugging:

```bash
# Run with source code mounting (for development)
docker run -it --rm \
  -v "$(pwd):/app" \
  -v zypher_modules:/app/node_modules \
  --name zypher-agent \
  zypher-agent

# Run unit tests
docker run -it --rm \
  -v "$(pwd):/app" \
  -v zypher_modules:/app/node_modules \
  zypher-agent bun test
```

#### Test Workspace

The Docker container includes a dedicated workspace at `/workspace` containing a real Next.js project from CoreSpeed's template. This workspace serves as a safe testing ground where the AI agent can:

- Make and test code changes
- Search and analyze code
- Refactor and experiment
- Create new features

The workspace is built into the Docker image and resets on each container start, providing a clean, isolated environment for testing the agent's capabilities.

When you start the agent, it automatically operates in the `/workspace` directory. Example tasks:

```
🔧 "Create a new utility function for date formatting"
🔧 "Refactor the authentication logic"
🔧 "Add error handling to the API routes"
🔧 "Create a new component for user profiles"
```

## Project Structure

```
src/
├── tools/          # Tool implementations
│   ├── EditFileTool.ts
│   ├── SearchTool.ts
│   └── ...
├── ZypherAgent.ts  # Main agent implementation
├── prompt.ts       # System prompts and instructions
└── utils.ts        # Utility functions

bin/
└── cli.ts         # CLI entry point and command handling
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Environment Variables

Required environment variables:

- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude

## License

Proprietary - All rights reserved
