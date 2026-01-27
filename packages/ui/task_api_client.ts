import type { Message } from "@zypher/agent";
import type {
  HttpTaskEvent as TaskEvent,
  HttpTaskEventId,
  TaskWebSocketClientMessage,
} from "@zypher/http";
import { Observable } from "rxjs";

// =========================== WEBSOCKET CONNECTION ===========================

/**
 * WebSocket connection manager for agent tasks
 */
export class AgentWebSocketConnection {
  private readonly ws: WebSocket;
  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  /**
   * Send message to WebSocket
   */
  private sendMessage(message: TaskWebSocketClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Cancel the current task
   */
  cancelTask(): void {
    this.sendMessage({
      action: "cancelTask",
    });
  }

  /**
   * Send tool approval response
   */
  approveTool(approved: boolean): void {
    this.sendMessage({
      action: "approveTool",
      approved,
    });
  }

  /**
   * Close the WebSocket connection
   */
  close(): void {
    this.ws.close();
  }
}

/**
 * Options for creating a ZypherApiClient
 */
export interface TaskApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string>;
}

/**
 * Options for starting a task
 */
export interface StartTaskOptions {
  fileAttachments?: string[];
}

export class TaskApiClient {
  private readonly options: TaskApiClientOptions;
  constructor(options: TaskApiClientOptions) {
    this.options = options;
  }

  /**
   * Get authorization headers if access token provider is configured
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.options.getAccessToken) {
      return {};
    }
    const accessToken = await this.options.getAccessToken();
    return { Authorization: `Bearer ${accessToken}` };
  }

  /**
   * Create WebSocket connection to the agent
   */
  private async createWebSocket(): Promise<WebSocket> {
    const wsUrl = this.options.baseUrl.replace(/^http/, "ws");
    const protocols = ["zypher.v1"];

    if (this.options.getAccessToken) {
      const accessToken = await this.options.getAccessToken();
      protocols.push(`ws-bearer-${accessToken}`);
    }

    return new WebSocket(`${wsUrl}/task/ws`, protocols);
  }

  /**
   * Setup common WebSocket event handlers
   */
  private setupWebSocketHandlers(
    ws: WebSocket,
    observer: {
      next: (value: TaskEvent) => void;
      error: (err: Error) => void;
      complete: () => void;
    },
  ): void {
    ws.onmessage = (event) => {
      try {
        const taskEvent: TaskEvent = JSON.parse(event.data);
        observer.next(taskEvent);
      } catch (error) {
        observer.error(
          new Error("Failed to parse task event message", { cause: error }),
        );
      }
    };

    ws.onerror = (error) => {
      observer.error(new Error("WebSocket connection error", { cause: error }));
    };

    ws.onclose = (event) => {
      console.log(
        `WebSocket connection closed: ${event.code} ${event.reason ?? ""}`,
      );
      if (event.code === 1000) {
        observer.complete();
      } else {
        observer.error(
          new Error(
            `Connection closed: ${event.code} ${
              event.reason ?? "Unknown reason"
            }`,
          ),
        );
      }
    };
  }

  /**
   * Start a task and return a connection with Observable of task events
   */
  async startTask(
    taskPrompt: string,
    options?: StartTaskOptions,
  ): Promise<{
    connection: AgentWebSocketConnection;
    events$: Observable<TaskEvent>;
  }> {
    const ws = await this.createWebSocket();
    const connection = new AgentWebSocketConnection(ws);

    const events$ = new Observable<TaskEvent>((observer) => {
      ws.onopen = () => {
        console.log("WebSocket connection opened");
        const message: TaskWebSocketClientMessage = {
          action: "startTask",
          task: taskPrompt,
          fileAttachments: options?.fileAttachments,
        };
        ws.send(JSON.stringify(message));
      };

      this.setupWebSocketHandlers(ws, observer);
    });

    return { connection, events$ };
  }

  /**
   * Resume a task and return a connection with Observable of task events
   */
  async resumeTask(lastEventId?: string): Promise<{
    connection: AgentWebSocketConnection;
    events$: Observable<TaskEvent>;
  }> {
    const ws = await this.createWebSocket();
    const connection = new AgentWebSocketConnection(ws);

    const events$ = new Observable<TaskEvent>((observer) => {
      ws.onopen = () => {
        console.log("WebSocket connection opened for resume");
        const message: TaskWebSocketClientMessage = {
          action: "resumeTask",
          lastEventId: lastEventId as unknown as HttpTaskEventId,
        };
        ws.send(JSON.stringify(message));
      };

      this.setupWebSocketHandlers(ws, observer);
    });

    return { connection, events$ };
  }

  /**
   * Fetch all messages from the agent
   */
  async getMessages(): Promise<Message[]> {
    const authHeaders = await this.getAuthHeaders();
    const response = await fetch(`${this.options.baseUrl}/messages`, {
      headers: authHeaders,
    });

    if (!response.ok) {
      throw new Error(`Failed to load messages: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Clear all message history
   */
  async clearMessages(): Promise<void> {
    const authHeaders = await this.getAuthHeaders();
    const response = await fetch(`${this.options.baseUrl}/messages`, {
      method: "DELETE",
      headers: authHeaders,
    });

    if (!response.ok) {
      throw new Error(`Failed to clear messages: ${response.status}`);
    }
  }

  /**
   * Apply a checkpoint to restore previous state
   */
  async applyCheckpoint(checkpointId: string): Promise<void> {
    const authHeaders = await this.getAuthHeaders();
    const response = await fetch(
      `${this.options.baseUrl}/checkpoints/${checkpointId}/apply`,
      {
        method: "POST",
        headers: authHeaders,
      },
    );

    if (!response.ok) {
      throw new Error("Failed to apply checkpoint");
    }
  }
}
