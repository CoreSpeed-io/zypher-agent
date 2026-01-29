# React Chat Example

A React chat interface for interacting with a Zypher Agent server. Built with
Deno, Vite, and Tailwind CSS.

## Prerequisites

- [Deno](https://deno.land/) v2.0+
- A running Zypher Agent HTTP server (default: `http://localhost:8080`)

## Quick Start

1. Start a Zypher Agent server:

```bash
deno run -A jsr:@zypher/http
```

Or from the repo root:

```bash
deno run -A packages/http/mod.ts
```

2. In a separate terminal, start the dev server:

```bash
cd examples/react
deno task dev
```

3. Open http://localhost:5173 in your browser.

## Configuration

### Server URL

Set the `VITE_API_URL` environment variable to point to your Zypher Agent
server:

```bash
VITE_API_URL=http://localhost:8080 deno task dev
```

Or create a `.env` file:

```env
VITE_API_URL=http://localhost:8080
```

Default: `http://localhost:8080`

### Authentication

To add authentication headers, edit `src/App.tsx`:

```tsx
const client = new TaskApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8080",
  headers: () => ({
    Authorization: `Bearer ${getToken()}`,
  }),
});
```

## Available Scripts

| Command             | Description                         |
| ------------------- | ----------------------------------- |
| `deno task dev`     | Start development server with HMR   |
| `deno task build`   | Type-check and build for production |
| `deno task preview` | Preview production build locally    |
| `deno task lint`    | Run ESLint                          |

## Project Structure

```
src/
├── App.tsx                 # Main app with chat UI
├── main.tsx                # Entry point
├── index.css               # Tailwind CSS imports
├── components/
│   ├── ai-elements/        # Vercel's ai-elements chat components
│   └── ui/                 # Base UI components (shadcn/ui)
└── lib/
    └── utils.ts            # Utility functions
```

## Tech Stack

- **Runtime**: Deno 2.0
- **Framework**: React 19
- **Build**: Vite 7
- **Styling**: Tailwind CSS 4
- **UI Components**: shadcn/ui + Radix UI
- **Agent Client**: `@zypher/ui`
