# CopilotKit UI for Zypher Agent

A Next.js frontend using [CopilotKit](https://copilotkit.ai) to interact with
the Zypher AG-UI server.

## Setup

See the [parent README](../README.md) for full setup instructions.

Quick start:

```bash
bun install
bun dev        # Starts the Next.js UI
```

## Available Scripts

- `bun dev` - Start the Next.js UI (port 3000)
- `bun build` - Build for production
- `bun start` - Start the production server
- `bun lint` - Run ESLint

## Customization

- `src/app/page.tsx` - Main UI component with CopilotKit sidebar
- `src/components/` - Custom React components

## Troubleshooting

If you see "trouble connecting to tools":

1. Check that the agent server is running on port 8000
2. Verify `ANTHROPIC_API_KEY` is set in `../.env`
