import { Observable } from "rxjs";
import type { Message, TaskEvent, ClientMessage, AgentInfo } from "../types";

export interface AgentClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string>;
}

export interface StartTaskOptions {
  fileAttachments?: string[];
}

export interface TaskConnection {
  cancel: () => void;
  approve: (yes: boolean) => void;
  close: () => void;
}

export interface TaskSession {
  connection: TaskConnection;
  events$: Observable<TaskEvent>;
}

export class AgentClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: () => Promise<string>;

  constructor(options: AgentClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.getAccessToken = options.getAccessToken;
  }

  async start(task: string, options?: StartTaskOptions): Promise<TaskSession> {
    return this.connect({ action: "startTask", task, fileAttachments: options?.fileAttachments });
  }

  async resume(lastEventId?: string): Promise<TaskSession> {
    return this.connect({ action: "resumeTask", lastEventId });
  }

  async messages(): Promise<Message[]> {
    const res = await this.fetch("/messages");
    if (!res.ok) {
      throw new Error(`Failed to get messages: ${res.statusText}`);
    }
    return res.json();
  }

  async clear(): Promise<void> {
    const res = await this.fetch("/messages", { method: "DELETE" });
    if (!res.ok) {
      throw new Error(`Failed to clear messages: ${res.statusText}`);
    }
  }

  async info(): Promise<AgentInfo> {
    const res = await this.fetch("/info");
    if (!res.ok) {
      throw new Error(`Failed to get agent info: ${res.statusText}`);
    }
    return res.json();
  }

  private async connect(message: ClientMessage): Promise<TaskSession> {
    const ws = await this.ws();
    const send = (msg: ClientMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const connection: TaskConnection = {
      cancel: () => send({ action: "cancelTask" }),
      approve: (yes) => send({ action: "approveTool", approved: yes }),
      close: () => ws.close(1000, "client_close"),
    };

    const events$ = new Observable<TaskEvent>((observer) => {
      let lastEvent: TaskEvent | null = null;

      ws.onopen = () => {
        ws.send(JSON.stringify(message));
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as TaskEvent;
          lastEvent = event;
          observer.next(event);

          if (event.type === "completed" || event.type === "cancelled") {
            observer.complete();
          } else if (event.type === "error") {
            observer.error(new Error(event.error));
          }
        } catch (err) {
          observer.error(
            new Error("Failed to parse task event message", { cause: err }),
          );
        }
      };

      ws.onerror = () => {
        observer.error(new Error("WebSocket connection error"));
      };

      ws.onclose = (e) => {
        const isFinalEvent =
          lastEvent?.type === "completed" || lastEvent?.type === "cancelled";
        if (e.code === 1000 || (e.code === 1006 && isFinalEvent)) {
          observer.complete();
        } else {
          observer.error(
            new Error(`Connection closed: ${e.reason || "Unknown reason"}`),
          );
        }
      };

      return () => connection.close();
    });

    return { connection, events$ };
  }

  private async ws(): Promise<WebSocket> {
    const url = this.baseUrl.replace(/^http/, "ws") + "/task/ws";
    const protocols = ["zypher.v1"];
    if (this.getAccessToken) protocols.push(`ws-bearer-${await this.getAccessToken()}`);
    return new WebSocket(url, protocols);
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.getAccessToken) headers["Authorization"] = `Bearer ${await this.getAccessToken()}`;
    return fetch(this.baseUrl + path, { ...init, headers });
  }
}
