/**
 * DenoWebWorkerRunner - Executes code inside sandboxed Worker.
 */

import { encodeBase64 } from "@std/encoding/base64";
import type {
  CodeExecutionResult,
  CodeExecutionRunner,
  ControllerMessage,
  ToolCallRequest,
  ToolCallResponse,
  ToolDefinitions,
} from "../../programmatic/protocol.ts";

declare const self: {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (e: MessageEvent) => void): void;
};

type ToolsProxy = Record<string, (args?: unknown) => Promise<unknown>>;

class DenoWebWorkerRunner implements CodeExecutionRunner {
  private pendingCalls = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private logs: string[] = [];

  constructor() {
    this.setupConsole();
    self.addEventListener("message", (e) => this.handleMessage(e.data));
  }

  private setupConsole(): void {
    const stringify = (v: unknown) =>
      typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
    const format = (args: unknown[]) => args.map(stringify).join(" ");
    console.log = (...args: unknown[]) => this.logs.push(format(args));
    console.info = (...args: unknown[]) =>
      this.logs.push(`[INFO] ${format(args)}`);
    console.debug = (...args: unknown[]) =>
      this.logs.push(`[DEBUG] ${format(args)}`);
    console.warn = (...args: unknown[]) =>
      this.logs.push(`[WARN] ${format(args)}`);
    console.error = (...args: unknown[]) =>
      this.logs.push(`[ERROR] ${format(args)}`);
  }

  private async handleMessage(msg: ControllerMessage): Promise<void> {
    switch (msg.type) {
      case "execute":
        await this.execute(msg.code, msg.toolDefinitions);
        break;
      case "tool_response":
        this.resolvePendingCall(msg);
        break;
      default:
        console.error(
          `Unknown message type for message: ${JSON.stringify(msg)}`,
        );
    }
  }

  private async execute(
    code: string,
    toolDefinitions: ToolDefinitions,
  ): Promise<void> {
    this.logs.length = 0;

    try {
      const tools = this.buildToolsProxy(toolDefinitions);
      const data = await this.runCode(code, tools);
      this.sendResult({ success: true, data, logs: this.getLogs() });
    } catch (e) {
      const error = e instanceof Error ? (e.stack ?? e.message) : String(e);
      this.sendResult({ success: false, error, logs: this.getLogs() });
    }
  }

  private buildToolsProxy(definitions: ToolDefinitions): ToolsProxy {
    return Object.fromEntries(
      definitions.map((t) => [
        t.name,
        (args?: unknown) => this.callTool(t.name, args ?? {}),
      ]),
    );
  }

  private async runCode(code: string, tools: ToolsProxy): Promise<unknown> {
    const moduleCode = `export default async function(tools) {\n${code}\n}`;
    const dataUrl = `data:application/typescript;base64,${
      encodeBase64(
        new TextEncoder().encode(moduleCode),
      )
    }`;
    return (await import(dataUrl)).default(tools);
  }

  private resolvePendingCall(msg: ToolCallResponse): void {
    const pending = this.pendingCalls.get(msg.callId);
    if (!pending) return;

    this.pendingCalls.delete(msg.callId);
    msg.error
      ? pending.reject(new Error(msg.error))
      : pending.resolve(msg.result);
  }

  private getLogs(): string[] | undefined {
    return this.logs.length > 0 ? [...this.logs] : undefined;
  }

  callTool(name: string, args: unknown): Promise<unknown> {
    const callId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pendingCalls.set(callId, { resolve, reject });
      self.postMessage({
        type: "tool_call",
        callId,
        toolName: name,
        args,
      } as ToolCallRequest);
    });
  }

  sendResult(result: Omit<CodeExecutionResult, "type">): void {
    self.postMessage({ type: "result", ...result } as CodeExecutionResult);
  }
}

new DenoWebWorkerRunner();
