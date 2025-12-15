# AG-UI Example

This example demonstrates how to run ZypherAgent as an AG-UI compatible server
that can connect to AG-UI frontends like [CopilotKit](https://copilotkit.ai) or
[AG-UI Dojo](https://github.com/ag-ui/ag-ui).

## Quick Start

1. Set your API key:

```bash
export ANTHROPIC_API_KEY=your_api_key
```

2. Run the server:

```bash
deno run --env --allow-all ./server.ts
```

3. The server will start on `http://localhost:8000`

## Connecting to AG-UI Dojo

AG-UI Dojo is a testing playground for AG-UI compatible agents. To connect
Zypher Agent to Dojo:

### Step 1: Clone and setup AG-UI Dojo

```bash
git clone https://github.com/ag-ui/ag-ui
cd ag-ui/apps/dojo
pnpm install
```

### Step 2: Add Zypher integration

Edit `src/menu.ts` to add Zypher to the integrations:

```typescript
// Add to menuIntegrations array
{
  id: "zypher",
  name: "Zypher Agent",
  features: [
    "agentic_chat",
    "backend_tool_rendering",
  ],
},
```

Edit `src/agents.ts` to add the Zypher agent:

```typescript
import { HttpAgent } from "@ag-ui/client";

// Add to agentsIntegrations array
{
  id: "zypher",
  agents: async () => {
    const zypherUrl = process.env.ZYPHER_URL ?? "http://localhost:8000";
    return {
      agentic_chat: new HttpAgent({
        url: zypherUrl,
      }),
      backend_tool_rendering: new HttpAgent({
        url: zypherUrl,
      }),
    };
  },
},
```

### Step 3: Run Dojo

```bash
pnpm dev
```

Then open `http://localhost:3000` and select "Zypher Agent" from the
integrations dropdown.

## Configuration

### Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic API key (required)
- `PORT` - Server port (default: 8000)
- `ZYPHER_MODEL` - Model to use (default: claude-sonnet-4-20250514)

### Custom Tools

The example includes a **Weather tool** for testing backend_tool_rendering.

To add custom tools, modify `server.ts`:

```typescript
import { createTool } from "@corespeed/zypher/tools";
import { z } from "zod";

const myTool = createTool({
  name: "my_tool",
  description: "Description of my tool",
  schema: z.object({
    param: z.string().describe("Parameter description"),
  }),
  execute: async ({ param }) => {
    return {
      content: [{ type: "text", text: `Result: ${param}` }],
    };
  },
});

const agent = await createZypherAgent({
  modelProvider,
  tools: [myTool],
});
```

### Backend Tool Rendering

For tools that render custom UI in the frontend (like weather cards), return
structured JSON in the text content:

```typescript
const getWeatherTool = createTool({
  name: "get_weather",
  description: "Get weather for a location",
  schema: z.object({
    location: z.string().describe("City name"),
  }),
  execute: ({ location }) => {
    // Return CallToolResult with JSON string for frontend rendering
    return Promise.resolve({
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          location,
          temperature: 22,
          conditions: "sunny",
          humidity: 45,
          wind_speed: 10,
          feels_like: 24,
        }),
      }],
    });
  },
});
```

The frontend (CopilotKit) can then render this with `useCopilotAction`:

```tsx
useCopilotAction({
  name: "get_weather",
  available: "disabled", // Don't expose to LLM, just render results
  render: ({ args, result, status }) => {
    if (status !== "complete") {
      return <div>Loading weather...</div>;
    }
    return <WeatherCard {...result} />;
  },
});
```

## API Reference

### createAGUIStream

The `createAGUIStream` function creates an AG-UI compatible SSE stream from a
request body:

```typescript
import { createAGUIStream } from "@corespeed/zypher/agui";

Deno.serve({ port: 8000 }, async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const stream = createAGUIStream(await request.json(), { agent });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
});
```

For CORS support, add preflight handling:

```typescript
Deno.serve({ port: 8000 }, async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const stream = createAGUIStream(await request.json(), { agent });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
```
