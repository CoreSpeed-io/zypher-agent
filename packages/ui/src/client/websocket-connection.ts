import type { ClientMessage } from "../types";

export class AgentWebSocketConnection {
  private closed = false;

  constructor(private readonly ws: WebSocket) {}

  get isClosed() {
    return this.closed || this.ws.readyState === WebSocket.CLOSED;
  }

  cancel() {
    this.send({ action: "cancelTask" });
  }

  approve(yes: boolean) {
    this.send({ action: "approveTool", approved: yes });
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      this.ws.close(1000, "client_close");
    }
  }

  private send(msg: ClientMessage) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
