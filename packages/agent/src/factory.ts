import type { ModelProvider } from "./llm/mod.ts";
import type { McpServerEndpoint } from "./mcp/mod.ts";
import {
  ZypherAgent,
  type ZypherAgentOptions,
  type ZypherContext,
} from "./ZypherAgent.ts";
import { createZypherContext } from "./utils/context.ts";

/**
 * Options for creating a ZypherAgent using the simplified factory function.
 * Extends ZypherAgentOptions with additional factory-specific options.
 */
export interface CreateZypherAgentOptions extends ZypherAgentOptions {
  /**
   * The AI model provider to use (Anthropic or OpenAI).
   * Can be a ModelProvider instance or a model string (e.g., "claude-sonnet-4-5-20250929", "gpt-5.2").
   * @example new AnthropicModelProvider({ apiKey: "..." })
   * @example "claude-sonnet-4-5-20250929"
   * @example "gpt-5.2"
   */
  modelProvider: ModelProvider | string;

  /**
   * Working directory for the agent. Defaults to Deno.cwd().
   */
  workingDirectory?: string;

  /**
   * MCP servers to register.
   * Accepts either:
   * - Package identifiers from the CoreSpeed MCP Store (e.g., "@corespeed/browser-rendering")
   * - Direct server endpoint configurations
   * @example ["@firecrawl/firecrawl", { id: "custom", type: "command", command: {...} }]
   */
  mcpServers?: (string | McpServerEndpoint)[];

  /**
   * Override context settings (userId, custom directories).
   */
  context?: Partial<Omit<ZypherContext, "workingDirectory">>;
}

/**
 * Creates a ZypherAgent with simplified initialization.
 *
 * This factory function wraps the multi-step agent creation process into a single call,
 * handling context creation, tool registration, and MCP server connections.
 *
 * @example
 * ```typescript
 * // Using a model string (recommended for most cases)
 * const agent = await createZypherAgent({
 *   modelProvider: "claude-sonnet-4-5-20250929",
 *   tools: [ReadFileTool, ListDirTool],
 * });
 *
 * // Using a ModelProvider instance (for provider-specific options)
 * const agent = await createZypherAgent({
 *   modelProvider: anthropic("claude-sonnet-4-5-20250929", { thinkingBudget: 10000 }),
 *   tools: [ReadFileTool, ListDirTool],
 *   mcpServers: ["@firecrawl/firecrawl"],
 * });
 *
 * const events$ = agent.runTask("Find latest AI news");
 * ```
 *
 * @param options Configuration options for agent creation
 * @returns A fully initialized ZypherAgent
 * @throws If any MCP server fails to register (fail-fast behavior)
 */
export async function createZypherAgent(
  options: CreateZypherAgentOptions,
): Promise<ZypherAgent> {
  // 1. Create context
  const workingDirectory = options.workingDirectory ?? Deno.cwd();
  const zypherContext = await createZypherContext(
    workingDirectory,
    options.context,
  );

  // 2. Create agent with tools
  const agent = new ZypherAgent(zypherContext, options.modelProvider, {
    storageService: options.storageService,
    checkpointManager: options.checkpointManager,
    tools: options.tools,
    config: options.config,
    overrides: options.overrides,
  });

  // 3. Register MCP servers in parallel
  if (options.mcpServers) {
    await Promise.all(
      options.mcpServers.map((server) =>
        typeof server === "string"
          ? agent.mcp.registerServerFromRegistry(server)
          : agent.mcp.registerServer(server)
      ),
    );
  }

  return agent;
}
