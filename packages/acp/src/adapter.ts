/**
 * ACP Protocol Adapter
 *
 * Implements the acp.Agent interface, bridging ZypherAgent's task execution
 * to the ACP protocol.
 */

import type * as acp from "acp";
import type { TaskEvent, ZypherAgent } from "@zypher/agent";
import type { ToolResult } from "@zypher/agent/tools";
import { eachValueFrom } from "rxjs-for-await";
import { convertPromptContent } from "./content.ts";
import denoConfig from "../deno.json" with { type: "json" };

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

export type AgentFactory = (
  cwd: string,
  mcpServers?: acp.McpServer[],
) => Promise<ZypherAgent>;

interface AcpSession {
  agent: ZypherAgent;
  abort: AbortController | null;
}

export class AcpProtocolAdapter implements acp.Agent {
  readonly #conn: acp.AgentSideConnection;
  readonly #factory: AgentFactory;
  readonly #sessions = new Map<string, AcpSession>();
  readonly #defaultModel: string;

  constructor(
    conn: acp.AgentSideConnection,
    factory: AgentFactory,
    model: string,
  ) {
    this.#conn = conn;
    this.#factory = factory;
    this.#defaultModel = model;
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
    const agent = await this.#factory(params.cwd, params.mcpServers);

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
      const observable = session.agent.runTask(
        promptText,
        this.#defaultModel,
        undefined,
        { signal: session.abort.signal },
      );

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
