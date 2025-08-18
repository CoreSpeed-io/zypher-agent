# Zypher Agent

An open-source framework for building production-ready agentic AI agents

## Features

- 🤖 Interactive CLI interface for fast prototyping
- 🛠️ Tool Calling & Model Context Protocol (MCP) support
- 📝 Git-based checkpoint system for tracking and reverting changes

## Installation

```bash
# Clone the repository
git clone https://github.com/CoreSpeed-io/zypher-agent.git
cd zypher-agent

# Install dependencies
deno install
```

## Getting Started
```bash
# Start the CLI
deno task start

# Run tests
deno task test

# Type checking
deno check .

# Linting
deno lint

# Format code
deno fmt
```

## Project Structure

```
src/
├── tools/          # Builtin tool implementations
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

## License

Proprietary - All rights reserved
