# Zypher Agent

An AI-powered coding assistant that helps you with code editing, file management, and development tasks through natural language interaction.

## Features

- 🤖 Interactive CLI interface for natural language coding tasks
- ✨ Smart code editing
- 📁 File and directory management
- 🔍 Semantic code search
- 🛠️ Multiple tool integrations

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/zypher-agent.git
cd zypher-agent

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and configuration
```

## Usage

Start the CLI:
```bash
pnpm start
```

The agent operates on files in the current working directory. For example:
```
🔧 Enter your task: Create a new file called utils.ts in the current directory

🔧 Enter your task: Add error handling to ./src/index.ts

🔧 Enter your task: Search for API endpoints in this codebase
```

## Development

### Local Development
```bash
# Run tests
pnpm test

# Type checking
pnpm type-check

# Linting
pnpm lint

# Format code
pnpm format
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
  zypher-agent pnpm test
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