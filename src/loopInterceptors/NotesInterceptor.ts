import type { Message } from "../message.ts";
import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";
import type { NotesStore } from "../memory/NotesStore.ts";

const NOTES_VERSION_PATTERN = /(?:^|\n)<notes>\n?v(\d+)\n/;

function flattenBlocks(content: Message["content"]): string {
  return content
    .map((b) => {
      if (!b) return "";
      if (b.type === "text" && typeof b.text === "string") return b.text;
      if (b.type === "tool_result") {
        if (typeof b.content === "string") return b.content;
        try {
          return JSON.stringify(b.content);
        } catch {
          return "";
        }
      }
      if (b.type === "tool_use") {
        try {
          return JSON.stringify(b.input);
        } catch {
          return "";
        }
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isInjected(msg: Message): boolean {
  if (!msg) return false;
  // @ts-ignore: Filter synthetic messages
  if (msg.synthetic) {
    const text = flattenBlocks(msg.content);
    return !!text && NOTES_VERSION_PATTERN.test(text);
  }
  if (msg.role === "user") {
    const text = flattenBlocks(msg.content);
    return !!text && /^(\s*)<notes>\n?v\d+\n[\s\S]*<\/notes>\s*$/m.test(text);
  }
  return false;
}

// Find the index of the last user message that contains text blocks, i.e.
// the task description or user input. Returns -1 if not found.
function findLastUserInputIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user") {
      const hasText = m.content.some((b) =>
        b?.type === "text" && typeof b.text === "string" &&
        b.text.trim().length > 0
      );
      if (hasText) return i;
    }
  }
  return -1;
}

export class NotesInterceptor implements LoopInterceptor {
  readonly name = "notes-interceptor";
  readonly description =
    "Summarizes recent messages (assistant & tool_result) into long-term notes; clears previous notes; inserts new <notes> at the beginning.";

  #store: NotesStore;

  constructor(store: NotesStore) {
    this.#store = store;
  }

  async intercept(context: InterceptorContext): Promise<InterceptorResult> {
    // Remove last injected notes
    for (let i = 0; i <= context.messages.length - 1; i++) {
      const m = context.messages[i];
      if (isInjected(m)) {
        context.messages.splice(i, 1);
        break;
      }
    }

    // Consider only the most recent messages related to the current task
    // Include all messages from the last user input to the end
    const lastUserInputIdx = findLastUserInputIndex(context.messages);

    const recentSlice = context.messages.slice(lastUserInputIdx);

    const windowText = recentSlice
      .map((m) => `[${m.role}] ${flattenBlocks(m.content)}`)
      .join("\n")
      .trim();

    if (!windowText) {
      return {
        decision: LoopDecision.COMPLETE,
        reasoning: "Empty recent window.",
      };
    }

    let changed = false;
    let versionForNotes: number | undefined;

    try {
      const res = await this.#store.noteWithModel({
        content: windowText,
      });
      changed = res.changed;
      versionForNotes = res.result?.version ?? undefined;
    } catch (e) {
      console.warn("[notes] update failed:", e);
    }

    const sum = await this.#store.buildSummary();
    if (!sum || !sum.text?.trim()) {
      return {
        decision: LoopDecision.COMPLETE,
        reasoning: "No summary available to inject.",
      };
    }

    const ver = versionForNotes ?? sum.version;
    const notesBlock = `\n<notes>\nv${ver}\n${sum.text}\n</notes>`;

    const headIsNotes = isInjected(context.messages[0]);

    if (headIsNotes) {
      const head = context.messages[0];
      head.content = [{ type: "text", text: notesBlock }];
      head.role = "user";
    } else {
      const syntheticMsg: Message = {
        role: "user",
        // @ts-ignore Filter synthetic messages
        synthetic: true,
        content: [{ type: "text", text: notesBlock }],
        timestamp: new Date(),
      };
      context.messages.unshift(syntheticMsg);
    }

    return {
      decision: LoopDecision.COMPLETE,
      reasoning: `Notes ${
        changed ? "updated" : "unchanged"
      }, inserted v${ver} after last user text message.`,
    };
  }
}
