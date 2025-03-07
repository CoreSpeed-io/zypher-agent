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

Example commands:
```
🔧 Enter your task: Create a new file called utils.ts with a date formatting function

🔧 Enter your task: Add error handling to the main function in src/index.ts

🔧 Enter your task: Search for all API endpoint implementations
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
```bash
# Build the container
docker compose build

# Start development environment
docker compose --profile dev up

# Get an interactive shell in the dev container
docker compose --profile dev run app sh

# Run tests
docker compose --profile test up

# Run tests with a specific file
docker compose run test pnpm test path/to/test
```

This project provides a Docker development environment that includes all necessary dependencies and tools (ripgrep, git, etc.) in an isolated environment. Using Docker is recommended for:
- Consistent development environment across team members
- Safe execution of system commands
- Isolated testing environment
- Preventing accidental file system modifications on the host

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