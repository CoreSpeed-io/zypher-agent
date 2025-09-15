import type { ContentBlock, Message } from "../../message.ts";
import type { NotesStore } from "../NotesStore.ts";
import type { ZypherAgent } from "../../ZypherAgent.ts";

export class NotesMiddleware {
  #originalSystem = "";
  constructor(
    private readonly store: NotesStore,
  ) {}

  /**
   * Inject NOTES into system message,
   * right after the "system prompt", before the context window.
   */
  async beforeModelCall(
    agent: ZypherAgent,
    ctx: { system: string; messages: Message[] },
  ): Promise<string | void> {
    if (!this.#originalSystem) {
      this.#originalSystem = ctx.system;
    } else if (ctx.system !== this.#originalSystem) {
      // Restore original system prompt if it was modified
      agent.setSystemPrompt(this.#originalSystem);
      ctx.system = this.#originalSystem;
    }

    const lastUser = lastUserMessage(ctx.messages);

    if (!lastUser) return;

    const userText = flattenTextBlocks(lastUser.content);
    const assistantText = ""; // No assistant text yet

    const facts = await this.store.extractFacts({
      userText,
      assistantText,
    });


    try {
      await this.store.upsertFacts(facts);
    } catch (e) {
      console.warn("[notes] upsertFacts failed:", e);
    }

    const sum = await this.store.buildSummary();
    if (!sum) return;

    const newSystem = ctx.system +
      `\n=== NOTES v${sum.version} ===\n${sum.text}\n=== END ===`;

    agent.setSystemPrompt(newSystem);
    return newSystem;
  }

  /**
   * After assistant responds, extract facts from the latest user+assistant texts and upsert into NotesStore.
   * First, restore the original system prompt.
   */
  async afterAssistantMessage(
    agent: ZypherAgent,
    ctx: { system: string; messages: Message[] },
  ): Promise<string | void> {
    // Restore original system prompt
    if (this.#originalSystem && ctx.system !== this.#originalSystem) {
      agent.setSystemPrompt(this.#originalSystem);
    }

    // Find the last user message
    const lastUser = lastUserMessage(ctx.messages);

    if (!lastUser) return;

    const userText = flattenTextBlocks(lastUser.content);
    const assistantText = flattenTextBlocks(
      ctx.messages[ctx.messages.length - 1].content,
    );

    const facts = await this.store.extractFacts({
      userText,
      assistantText,
    });

    if (!facts.length) return;

    try {
      await this.store.upsertFacts(facts);
    } catch (e) {
      console.warn("[notes] upsertFacts failed:", e);
    }
  }
}

function flattenTextBlocks(blocks: ContentBlock[] | undefined): string {
  if (!Array.isArray(blocks)) return "";
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
    }
  }
  return parts.join("\n");
}

function lastUserMessage(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return messages[i];
    }
  }
  return undefined;
}
