# CopilotKit <> Zypher Starter

This is a starter template for building AI agents using
[Zypher](https://github.com/corespeed-io/zypher-agent) and
[CopilotKit](https://copilotkit.ai). It provides a modern Next.js application
with an integrated investment analyst agent that can research stocks, analyze
market data, and provide investment insights.

## Prerequisites

- Node.js 20+
- Deno (for the backend agent server)
- Anthropic API Key (for the Zypher agent)
- Any of the following package managers:
  - pnpm (recommended)
  - npm
  - yarn
  - bun

> **Note:** This repository ignores lock files (package-lock.json, yarn.lock,
> pnpm-lock.yaml, bun.lockb) to avoid conflicts between different package
> managers. Each developer should generate their own lock file using their
> preferred package manager. After that, make sure to delete it from the
> .gitignore.

## Getting Started

1. Install dependencies using your preferred package manager:

```bash
# Using pnpm (recommended)
pnpm install

# Using npm
npm install

# Using yarn
yarn install

# Using bun
bun install
```

2. Set up your Anthropic API key:

Create a `.env` file in the parent `agui` folder with the following content:

```
ANTHROPIC_API_KEY=sk-ant-...your-anthropic-key-here...
```

3. Start the development server:

```bash
# Using pnpm
pnpm dev

# Using npm
npm run dev

# Using yarn
yarn dev

# Using bun
bun run dev
```

This will start both the UI and agent servers concurrently.

## Available Scripts

The following scripts can also be run using your preferred package manager:

- `dev` - Starts both UI and agent servers in development mode
- `dev:debug` - Starts development servers with debug logging enabled
- `dev:ui` - Starts only the Next.js UI server
- `dev:agent` - Starts only the Zypher agent server (Deno)
- `build` - Builds the Next.js application for production
- `start` - Starts the production server
- `lint` - Runs ESLint for code linting

## Documentation

The main UI component is in `src/app/page.tsx`. You can:

- Modify the theme colors and styling
- Add new frontend actions
- Customize the CopilotKit sidebar appearance

## 📚 Documentation

- [Zypher Documentation](https://github.com/corespeed-io/zypher-agent) - Learn
  more about Zypher and its features
- [CopilotKit Documentation](https://docs.copilotkit.ai) - Explore CopilotKit's
  capabilities
- [Next.js Documentation](https://nextjs.org/docs) - Learn about Next.js
  features and API

## Contributing

Feel free to submit issues and enhancement requests! This starter is designed to
be easily extensible.

## License

This project is licensed under the MIT License - see the LICENSE file for
details.

## Troubleshooting

### Agent Connection Issues

If you see "I'm having trouble connecting to my tools", make sure:

1. The Zypher agent server is running on port 8000
2. Your Anthropic API key is set correctly in the `.env` file
3. Both servers started successfully

### Running the Agent Server Manually

If you need to run the agent server manually:

```bash
cd ..  # Go to the parent agui folder
deno run --env --allow-all ./server.ts
```
