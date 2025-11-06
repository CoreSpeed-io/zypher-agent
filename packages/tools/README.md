# @corespeed/zypher-tools

Official tool collection for Zypher Agent, providing file operations, terminal
commands, search capabilities, and image generation.

## Features

- **File Operations**: Read, edit, list, copy, and delete files
- **Search Tools**: File search and grep search capabilities
- **Terminal Integration**: Execute terminal commands
- **Image Tools**: Generate and edit images using OpenAI (optional)
- **Type-Safe**: Zod schema validation for all tool parameters

## Installation

```bash
deno add @corespeed/zypher-tools
```

Or with npm:

```bash
npm install @corespeed/zypher-tools
```

## Usage

```typescript
import { createZypherContext, ZypherAgent } from "@corespeed/zypher";
import {
  createEditFileTools,
  createImageTools,
  EditFileTool,
  FileSearchTool,
  GrepSearchTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
} from "@corespeed/zypher-tools";

// Create agent
const context = await createZypherContext(Deno.cwd());
const agent = new ZypherAgent(context, provider);

// Register tools
const mcpServerManager = agent.mcp;

// File tools
mcpServerManager.registerTool(ReadFileTool);
mcpServerManager.registerTool(ListDirTool);
mcpServerManager.registerTool(CopyFileTool);
mcpServerManager.registerTool(DeleteFileTool);

// Edit file tool (requires backup directory)
const { EditFileTool } = createEditFileTools("./.backup");
mcpServerManager.registerTool(EditFileTool);

// Search tools
mcpServerManager.registerTool(GrepSearchTool);
mcpServerManager.registerTool(FileSearchTool);

// Terminal tool
mcpServerManager.registerTool(RunTerminalCmdTool);

// Image tools (optional - requires OpenAI API key)
const { ImageGenTool, ImageEditTool } = createImageTools("openai-api-key");
mcpServerManager.registerTool(ImageGenTool);
mcpServerManager.registerTool(ImageEditTool);
```

## Available Tools

### File Operations

- **ReadFileTool**: Read file contents
- **EditFileTool**: Edit files with diff-based changes and backup support
- **ListDirTool**: List directory contents
- **CopyFileTool**: Copy files
- **DeleteFileTool**: Delete files

### Search Tools

- **GrepSearchTool**: Search file contents using regex patterns
- **FileSearchTool**: Find files by name patterns

### Terminal

- **RunTerminalCmdTool**: Execute shell commands

### Image Tools (Optional)

- **ImageGenTool**: Generate images using DALL-E
- **ImageEditTool**: Edit images using DALL-E

## Creating Custom Tools

```typescript
import {
  createTool,
  type Tool,
  type ToolExecutionContext,
} from "@corespeed/zypher-tools";
import { z } from "zod";

const MyCustomTool = createTool({
  name: "my_custom_tool",
  description: "Does something useful",
  schema: z.object({
    input: z.string().describe("The input parameter"),
  }),
  execute: async (params, ctx: ToolExecutionContext) => {
    // Tool implementation
    return `Result: ${params.input}`;
  },
});
```

## Type Definitions

```typescript
export interface Tool<P extends BaseParams = BaseParams> {
  readonly name: string;
  readonly description: string;
  readonly parameters: InputSchema;
  execute(params: P, ctx: ToolExecutionContext): Promise<ToolResult>;
}

export interface ToolExecutionContext {
  workingDirectory: string;
}

export type ToolResult = CallToolResult | string;
```

## License

Apache-2.0
