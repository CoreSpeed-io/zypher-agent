import { Observable } from "rxjs";
import { webSocket, WebSocketSubject } from "rxjs/webSocket";
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

  private async connect(initialMessage: ClientMessage): Promise<TaskSession> {
    const wsUrl = this.baseUrl.replace(/^http/, "ws") + "/task/ws";
    const protocols = ["zypher.v1"];
    if (this.getAccessToken) {
      protocols.push(`ws-bearer-${await this.getAccessToken()}`);
    }

    let lastEvent: TaskEvent | null = null;

    const socket$: WebSocketSubject<ClientMessage | TaskEvent> = webSocket({
      url: wsUrl,
      protocol: protocols,
      serializer: (msg) => JSON.stringify(msg),
      deserializer: (e) => JSON.parse(e.data) as TaskEvent,
      openObserver: {
        next: () => {
          socket$.next(initialMessage);
        },
      },
    });

    const connection: TaskConnection = {
      cancel: () => socket$.next({ action: "cancelTask" }),
      approve: (yes) => socket$.next({ action: "approveTool", approved: yes }),
      close: () => socket$.complete(),
    };

    const events$ = new Observable<TaskEvent>((observer) => {
      const subscription = (socket$ as unknown as Observable<TaskEvent>).subscribe({
        next: (event) => {
          lastEvent = event;
          observer.next(event);

          if (event.type === "completed" || event.type === "cancelled") {
            observer.complete();
          } else if (event.type === "error") {
            observer.error(new Error(event.error));
          }
        },
        error: (err) => {
          observer.error(err instanceof Error ? err : new Error(String(err)));
        },
        complete: () => {
          const isFinalEvent = lastEvent?.type === "completed" || lastEvent?.type === "cancelled";
          if (!isFinalEvent) {
            observer.error(new Error("Connection closed unexpectedly"));
          }
        },
      });

      return () => {
        subscription.unsubscribe();
        socket$.complete();
      };
    });

    return { connection, events$ };
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.getAccessToken) headers["Authorization"] = `Bearer ${await this.getAccessToken()}`;
    return fetch(this.baseUrl + path, { ...init, headers });
  }
}
