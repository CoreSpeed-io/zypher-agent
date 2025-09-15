import type { Message } from "../../message.ts";
import type { ZypherAgent } from "../../ZypherAgent.ts";

export interface Middleware {
  beforeModelCall?(agent: ZypherAgent, ctx: {
    system: string;
    messages: Message[];
  }): Promise<string | void> | string | void;

  afterAssistantMessage?(agent: ZypherAgent, ctx: {
    system: string;
    messages: Message[];
  }): Promise<string | void> | string | void;
}
