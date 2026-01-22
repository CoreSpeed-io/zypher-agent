import type { ModelProvider } from "./llm/mod.ts";
import {
  continueOnMaxTokens,
  executeTools,
  type LoopInterceptor,
  LoopInterceptorManager,
} from "./loop_interceptors/mod.ts";
import type { McpServerEndpoint } from "./mcp/mod.ts";
import { McpServerManager } from "./mcp/mcp_server_manager.ts";
import {
  ZypherAgent,
  type ZypherAgentOptions,
  type ZypherContext,
} from "./zypher_agent.ts";
import { createZypherContext } from "./utils/context.ts";

/**
 * Options for creating a ZypherAgent using the simplified factory function.
 * Extends ZypherAgentOptions with additional factory-specific options.
 */
export interface CreateZypherAgentOptions extends ZypherAgentOptions {
  /**
   * The model to use. Can be:
   * - A model string (e.g., "claude-sonnet-4-5-20250929", "gpt-5.2")
   * - A ModelProvider instance (for provider-specific options)
   * @example "claude-sonnet-4-5-20250929"
   * @example "gpt-5.2"
   * @example anthropic("claude-sonnet-4-5-20250929", { thinkingBudget: 10000 })
   */
  model: ModelProvider | string;

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

  /**
   * Custom loop interceptors for post-inference processing.
   *
   * Loop interceptors run after each LLM response and can:
   * - Execute tool calls
   * - Auto-continue on max tokens
   * - Detect and report errors
   * - Add custom verification logic
   *
   * When provided, this completely replaces the default interceptors.
   * Use helper functions like `executeTools()`, `continueOnMaxTokens()`,
   * and `errorDetector()` to build your interceptor chain.
   *
   * @example
   * ```typescript
   * const agent = await createZypherAgent({
   *   model: "claude-sonnet-4-5-20250929",
   *   loopInterceptors: [
   *     executeTools(mcpManager),
   *     continueOnMaxTokens(),
   *     errorDetector("deno check ."),
   *   ],
   * });
   * ```
   *
   * If not provided, defaults to `[executeTools(mcpManager), continueOnMaxTokens()]`.
   */
  loopInterceptors?: LoopInterceptor[];
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
 *   model: "claude-sonnet-4-5-20250929",
 *   tools: [ReadFileTool, ListDirTool],
 * });
 *
 * // Using a ModelProvider instance (for provider-specific options)
 * const agent = await createZypherAgent({
 *   model: anthropic("claude-sonnet-4-5-20250929", { thinkingBudget: 10000 }),
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

  // 2. Create MCP server manager (needed for tool execution interceptor)
  const mcpServerManager = options.overrides?.mcpServerManager ??
    new McpServerManager(zypherContext);

  // 3. Create loop interceptor manager
  let loopInterceptorManager = options.overrides?.loopInterceptorManager;
  if (!loopInterceptorManager) {
    // Use custom interceptors if provided, otherwise use defaults
    const interceptors = options.loopInterceptors ?? [
      executeTools(mcpServerManager),
      continueOnMaxTokens(),
    ];
    loopInterceptorManager = new LoopInterceptorManager(interceptors);
  }

  // 4. Create agent with tools
  const agent = new ZypherAgent(zypherContext, options.model, {
    storageService: options.storageService,
    checkpointManager: options.checkpointManager,
    tools: options.tools,
    initialMessages: options.initialMessages,
    config: options.config,
    overrides: {
      ...options.overrides,
      mcpServerManager,
      loopInterceptorManager,
    },
  });

  // 5. Register MCP servers in parallel
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
