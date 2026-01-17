/**
 * Zypher ACP Agent
 *
 * Implements the acp.Agent interface, bridging ZypherAgent's task execution
 * to the ACP protocol.
 */

import type { McpServerEndpoint, TaskEvent, ZypherAgent } from "@zypher/agent";
import type { ToolResult } from "@zypher/agent/tools";
import type * as acp from "acp";
import { eachValueFrom } from "rxjs-for-await";
import { convertPromptContent } from "./content.ts";
import denoConfig from "./deno.json" with { type: "json" };

/**
 * Converts ACP McpServer configurations to Zypher McpServerEndpoint format.
 */
function convertMcpServers(acpServers: acp.McpServer[]): McpServerEndpoint[] {
  return acpServers.map((server): McpServerEndpoint => {
    if ("type" in server && (server.type === "http" || server.type === "sse")) {
      return {
        id: server.name,
        type: "remote",
        remote: {
          url: server.url,
          headers: Object.fromEntries(
            server.headers.map((h) => [h.name, h.value]),
          ),
        },
      };
    }

    const stdioServer = server as acp.McpServerStdio;
    return {
      id: stdioServer.name,
      type: "command",
      command: {
        command: stdioServer.command,
        args: stdioServer.args,
        env: Object.fromEntries(stdioServer.env.map((e) => [e.name, e.value])),
      },
    };
  });
}

/**
 * Extracts success status and content string from a ToolResult
 */
function extractToolResult(result: ToolResult): {
  success: boolean;
  content: string;
} {
  if (typeof result === "string") {
    return { success: true, content: result };
  }

  const success = !result.isError;

  if (result.structuredContent) {
    return { success, content: JSON.stringify(result.structuredContent) };
  }

  const content = result.content
    .map((c) => {
      if (c.type === "text") return c.text;
      if (c.type === "image") return "[image]";
      return JSON.stringify(c);
    })
    .join("\n");

  return { success, content };
}

/**
 * Client configuration passed to the agent builder.
 */
export interface AcpClientConfig {
  /** Working directory for the session */
  cwd: string;
  /** MCP servers(from ACP client) configured for this session */
  mcpServers?: McpServerEndpoint[];
}

export type ZypherAgentBuilder = (
  clientConfig: AcpClientConfig,
) => Promise<ZypherAgent>;

interface AcpSession {
  agent: ZypherAgent;
  abort: AbortController | null;
}

export class ZypherAcpAgent implements acp.Agent {
  readonly #conn: acp.AgentSideConnection;
  readonly #builder: ZypherAgentBuilder;
  readonly #sessions = new Map<string, AcpSession>();

  constructor(conn: acp.AgentSideConnection, builder: ZypherAgentBuilder) {
    this.#conn = conn;
    this.#builder = builder;
  }

  initialize(_params: acp.InitializeRequest): Promise<acp.InitializeResponse> {
    return Promise.resolve({
      protocolVersion: 1,
      agentInfo: {
        name: "zypher-agent",
        title: "Zypher Agent",
        version: denoConfig.version,
      },
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: {
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
      },
    });
  }

  async newSession(
    params: acp.NewSessionRequest,
  ): Promise<acp.NewSessionResponse> {
    const sessionId = crypto.randomUUID();
    const mcpServers = params.mcpServers
      ? convertMcpServers(params.mcpServers)
      : undefined;
    const agent = await this.#builder({ cwd: params.cwd, mcpServers });

    this.#sessions.set(sessionId, {
      agent,
      abort: null,
    });

    return { sessionId };
  }

  authenticate(
    _params: acp.AuthenticateRequest,
  ): Promise<acp.AuthenticateResponse | void> {
    return Promise.resolve({});
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    const session = this.#sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Session ${params.sessionId} not found`);
    }

    session.abort?.abort();
    session.abort = new AbortController();
    // TODO: support image
    // https://agentclientprotocol.com/protocol/initialization#prompt-capabilities
    const { text: promptText } = convertPromptContent(params.prompt);

    try {
      const observable = session.agent.runTask(promptText, undefined, {
        signal: session.abort.signal,
      });

      for await (const event of eachValueFrom(observable)) {
        this.#handleTaskEvent(params.sessionId, event);
      }

      return { stopReason: "end_turn" };
    } catch (error) {
      if (session.abort.signal.aborted) {
        return { stopReason: "cancelled" };
      }
      throw error;
    } finally {
      session.abort = null;
    }
  }

  cancel(params: acp.CancelNotification): Promise<void> {
    const session = this.#sessions.get(params.sessionId);
    if (session?.abort) {
      session.abort.abort();
      session.abort = null;
    }
    return Promise.resolve();
  }

  #handleTaskEvent(sessionId: string, event: TaskEvent): void {
    switch (event.type) {
      case "text":
        this.#conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: event.content },
          },
        });
        break;

      case "tool_use": {
        this.#conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: event.toolUseId,
            title: event.toolName,
            kind: this.#getToolKind(event.toolName),
            status: "in_progress",
          },
        });
        break;
      }

      case "tool_use_input": {
        this.#conn.sessionUpdate({
          sessionId,
          update: {
            title: event.toolName,
            sessionUpdate: "tool_call_update",
            toolCallId: event.toolUseId,
            rawInput: event.partialInput,
            status: "in_progress",
          },
        });
        break;
      }

      case "tool_use_result": {
        const { success, content } = extractToolResult(event.result);
        this.#conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: event.toolUseId,
            status: success ? "completed" : "failed",
            rawOutput: content,
          },
        });
        break;
      }

      case "tool_use_error": {
        this.#conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: event.toolUseId,
            status: "failed",
            rawOutput: String(event.error),
          },
        });
        break;
      }

      case "message":
        // Tool results are now handled by tool_use_result event
        break;

      case "completed":
      case "cancelled":
      case "usage":
      case "history_changed":
        break;
    }
  }

  #getToolKind(toolName: string): acp.ToolKind {
    const name = toolName.toLowerCase();
    if (name.includes("read") || name.includes("list")) return "read";
    if (name.includes("edit") || name.includes("write")) return "edit";
    if (name.includes("delete") || name.includes("remove")) return "delete";
    if (
      name.includes("search") ||
      name.includes("grep") ||
      name.includes("find")
    ) {
      return "search";
    }
    if (
      name.includes("run") ||
      name.includes("exec") ||
      name.includes("terminal")
    ) {
      return "execute";
    }
    return "other";
  }
}
