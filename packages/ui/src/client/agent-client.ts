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

    const events$ = new Observable<TaskEvent>((sub) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(message));
      };
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as TaskEvent;
          sub.next(event);
          if (event.type === "completed" || event.type === "cancelled") sub.complete();
          else if (event.type === "error") {
            sub.error(new Error(event.error));
          }
        } catch (err) {
          sub.error(err);
        }
      };
      ws.onerror = () => {
        sub.error(new Error("WebSocket error"));
      };
      ws.onclose = (e) => {
        if (e.code === 1000) {
          sub.complete();
        } else {
          sub.error(new Error(`WebSocket closed: ${e.code}`));
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
