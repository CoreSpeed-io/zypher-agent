# Zypher Agent Examples

Examples demonstrating how to use Zypher Agent.

## Structure

**Simple examples** are single `.ts` files directly in this folder:

- `calendar.ts` - Calendar agent with custom appointment/timezone tools
- `coding.ts` - Coding assistant with file tools and error detection
- `cloudflare_gateway.ts` - Cloudflare AI Gateway model provider
- `loop_interceptor.ts` - Custom loop interceptors
- `ptc.ts` - Programmatic tool calling with execute_code

**Complex examples** have their own subdirectories:

- `mcp/` - MCP client with OAuth, React/Ink UI
- `agui/` - AG-UI server with Next.js frontend

## Running Examples

1. Set your API key:

   ```bash
   export ANTHROPIC_API_KEY=your_key_here
   ```

2. Run an example:

   ```bash
   deno run --env -A examples/calendar.ts
   ```

## Adding New Examples

- **Simple examples**: Add a single `.ts` file to this folder
- **Complex examples**: Create a subdirectory with its own `deno.json`
