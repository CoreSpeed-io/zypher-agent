import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import type { ModelProvider } from "../llm/mod.ts";

const DEFAULT_MAX_TOKENS_MEMORY = 8192;
const DEFAULT_MIN_CONFIDENCE = 0.6;

export type Fact = {
  k: string;
  v: string;
  conf?: number; // Confidence 0..1
  source?: "user" | "assistant";
};

export type NoteRecord = {
  version: number;
  is_active: boolean;
  pinned?: boolean;
  summary: string;
  facts: Fact[];
  updated_at: string;
};

type Notes = { notes: NoteRecord[] };
type Facts = { facts: Fact[] };

type NotesFinal = {
  noop?: boolean;
  pinned?: boolean;
  facts?: Fact[];
  summary?: string;
};

const SUMMARY_SYSTEM = `
You are a careful summarizer for a personal notes knowledge base.
Goal: produce a crisp, non-redundant overview of the CURRENT ACTIVE notes.
Prioritize: pinned notes first, then most-recently updated.
Be concrete; prefer bullets and short sentences.
Do not invent facts. If conflicting facts exist, mention the conflict briefly.
`.trim();

const FACTS_SYSTEM = `
You are a fact extractor for long-term memory.
Only output facts that are stable, reusable, important, or worth highlighting:
- User preferences (lang/theme/region/timezone…)
- Aliases, URLs, IDs
- Deadlines/due dates (ISO 8601)
- Numeric constraints (budgets, limits, thresholds, version numbers, units, etc)
- Highlight-worthy details that may not be strictly factual but are important enough to retain

Do NOT output ephemeral details, vague opinions, or speculative information.

Return ONLY valid JSON matching this schema; do not include any extra text:
{ "facts": [ { "k": string, "v": string, "conf"?: number, "source"?: "user" | "assistant" } ] }
`.trim();

const REDUCER_SYSTEM = `
You are a careful notes reducer for a personal knowledge base.
Your task: decide whether to update the notes. If no meaningful, stable change is needed, return {"noop": true}.

If updating, return the FULL and FINAL notes content to overwrite existing notes:
- Prefer stable, reusable facts only (preferences, IDs, URLs, budgets, deadlines ISO 8601, numeric thresholds).
- Remove obsolete/contradicted facts. Resolve conflicts; if uncertain, prefer most recent and mention uncertainty briefly in summary.
- Deduplicate by key; each key is unique, short, and concrete.
- Keep the total number of facts reasonable (<= 200).
- Avoid vague opinions and ephemeral details.

Output JSON ONLY with this schema:
{ "noop"?: boolean, "pinned"?: boolean, "facts"?: [{ "k": string, "v": string, "conf"?: number, "source"?: "user" | "assistant" }], "summary"?: string }
Do NOT include any extra commentary.
`.trim();

export class NotesStore {
  #file: string;
  #modelProvider: ModelProvider;
  #notesModel: string;
  #maxTokens: number;

  #summarySystem = SUMMARY_SYSTEM;
  #factsSystem = FACTS_SYSTEM;
  #reducerSystem = REDUCER_SYSTEM;

  constructor(
    notesDir = ".memory",
    modelProvider: ModelProvider,
    notesModel: string,
    maxTokens = DEFAULT_MAX_TOKENS_MEMORY,
  ) {
    this.#file = path.join(notesDir, "notes.json");
    this.#modelProvider = modelProvider;
    this.#notesModel = notesModel;
    this.#maxTokens = maxTokens;
  }

  async #load(): Promise<Notes> {
    await ensureDir(path.dirname(this.#file));
    try {
      const txt = await Deno.readTextFile(this.#file);
      return JSON.parse(txt) as Notes;
    } catch {
      return { notes: [] };
    }
  }

  async #save(data: Notes) {
    await ensureDir(path.dirname(this.#file));
    await Deno.writeTextFile(this.#file, JSON.stringify(data, null, 2));
  }

  async getActiveNote(): Promise<NoteRecord | null> {
    const db = await this.#load();
    const note = db.notes.find((n) => n.is_active);
    return note ?? null;
  }

  async listActiveNotes(): Promise<NoteRecord[]> {
    const db = await this.#load();
    return db.notes.filter((n) => n.is_active);
  }

  async upsertFacts(
    facts: Fact[],
    opts?: { pinned?: boolean },
  ): Promise<NoteRecord | null> {
    if (facts.length === 0) return null;

    const db = await this.#load();
    const now = new Date().toISOString();

    const current = db.notes.find((n) => n.is_active);

    // Merge facts by key
    const mergedMap = new Map<string, string>();
    for (const f of current?.facts ?? []) mergedMap.set(f.k, f.v);
    for (const f of facts) mergedMap.set(f.k, f.v);
    const mergedFacts = [...mergedMap.entries()].map(([k, v]) => ({ k, v }));

    // Simple local summary
    const summary = this.#summarize(mergedFacts);

    if (current) current.is_active = false;

    const newRec: NoteRecord = {
      version: (current?.version ?? 0) + 1,
      is_active: true,
      pinned: opts?.pinned ?? current?.pinned ?? false,
      summary,
      facts: mergedFacts,
      updated_at: now,
    };
    db.notes.push(newRec);
    await this.#save(db);
    return newRec;
  }

  async buildSummary(): Promise<{ version: number; text: string } | null> {
    const notes = await this.listActiveNotes();
    if (notes.length === 0) return null;

    const sorted = [...notes].sort((a, b) => {
      const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b.updated_at.localeCompare(a.updated_at);
    });

    const lines: string[] = [];
    for (const n of sorted) {
      lines.push(`- [NOTES] v${n.version} @${n.updated_at}`);
      for (const f of n.facts) lines.push(`  • ${f.k} = ${f.v}`);
    }

    const userContent = `
Summarize the following ACTIVE notes into a concise, reusable overview.

ACTIVE NOTES (pinned first, recent first):
${lines.join("\n")}
`.trim();

    const assistantText = await this.#chatOnce({
      model: this.#notesModel,
      system: this.#summarySystem,
      user: userContent,
    });

    return {
      version: Math.max(...sorted.map((s) => s.version)),
      text: assistantText.trim(),
    };
  }

  // Simple local summary as fallback
  #summarize(facts: Fact[]): string {
    const head = "Current known facts: ";
    const body = facts.map((f) => `${f.k}=${f.v}`).join("; ");
    return `${head}${body}`;
  }

  async extractFacts(params: {
    userText: string;
    assistantText: string;
    model?: string; // defaults to this.#notesModel
    minConf?: number; // drop facts below this confidence
  }): Promise<Fact[]> {
    const {
      userText,
      assistantText,
      model = this.#notesModel,
      minConf = DEFAULT_MIN_CONFIDENCE,
    } = params;

    const prompt = `
Extract long-term memory facts from the following two texts.
Return ONLY JSON and match the schema shown in the system prompt.

User:
${userText || "(empty)"}

Assistant:
${assistantText || "(empty)"}
`.trim();

    const raw = await this.#chatOnce({
      model,
      system: this.#factsSystem,
      user: prompt,
    });

    const parsed = this.#safeParseFactsJSON(raw);

    // Deduplicate by key, filter by confidence
    const map = new Map<string, Fact>();
    for (const f of parsed) {
      const fact: Fact = {
        k: String(f.k || "").slice(0, 64),
        v: String(f.v || "").slice(0, 2048),
        conf: typeof f.conf === "number"
          ? Math.max(0, Math.min(1, f.conf))
          : undefined,
        source: f.source === "assistant" ? "assistant" : "user",
      };
      if (!fact.k || !fact.v) continue;
      if (fact.conf !== undefined && fact.conf < minConf) {
        continue;
      }
      map.set(fact.k, fact);
    }
    return [...map.values()];
  }

  async reduceWithModel(params: {
    userText: string;
    assistantText: string;
    model?: string;
    minConf?: number;
  }): Promise<{
    changed: boolean;
    result: NoteRecord | null;
    reason?: "noop" | "invalid" | "empty" | "same";
  }> {
    const model = params.model ?? this.#notesModel;
    const minConf = params.minConf ?? DEFAULT_MIN_CONFIDENCE;

    const current = await this.getActiveNote();
    const currentPinned = current?.pinned ?? false;
    const currentFacts = current?.facts ?? [];

    const userContent = `
CURRENT ACTIVE NOTE:
${
      JSON.stringify(
        {
          pinned: currentPinned,
          facts: currentFacts,
        },
        null,
        2,
      )
    }

NEW CONTEXT:
${
      JSON.stringify(
        {
          user: params.userText || "(empty)",
          assistant: params.assistantText || "(empty)",
        },
        null,
        2,
      )
    }
`.trim();

    const finalObj = await this.#chatOnceJson({
      model,
      system: this.#reducerSystem,
      user: userContent,
    }) as NotesFinal | null;

    if (!finalObj || typeof finalObj !== "object") {
      return { changed: false, result: null, reason: "invalid" };
    }

    if (finalObj.noop === true) {
      return { changed: false, result: null, reason: "noop" };
    }

    const pinned: boolean = typeof finalObj.pinned === "boolean"
      ? finalObj.pinned
      : currentPinned;
    const factsRaw: Fact[] = Array.isArray(finalObj.facts)
      ? finalObj.facts
      : currentFacts;

    const map = new Map<string, Fact>();
    for (const f of factsRaw) {
      const k = String(f?.k ?? "").trim().slice(0, 64);
      const v = String(f?.v ?? "").trim().slice(0, 2048);
      if (!k || !v) continue;

      let conf: number | undefined = undefined;
      if (typeof f?.conf === "number") {
        conf = Math.max(0, Math.min(1, f.conf));
        if (conf < minConf) continue;
      }

      const source: "user" | "assistant" = f?.source === "assistant"
        ? "assistant"
        : "user";
      map.set(k, { k, v, conf, source });
    }
    const cleanedFacts = [...map.values()];

    const providedSummary = typeof finalObj.summary === "string"
      ? finalObj.summary.trim()
      : "";
    const summary = providedSummary || this.#summarize(cleanedFacts);

    const samePinned = pinned === currentPinned;
    const eq = (a: Fact[], b: Fact[]) => {
      if (a.length !== b.length) return false;
      const A = new Map(a.map((f) => [f.k, f.v]));
      for (const f of b) {
        if (!A.has(f.k) || A.get(f.k) !== f.v) return false;
      }
      return true;
    };
    if (samePinned && eq(cleanedFacts, currentFacts)) {
      return { changed: false, result: null, reason: "same" };
    }

    const db = await this.#load();
    const now = new Date().toISOString();
    if (current) current.is_active = false;

    const newRec: NoteRecord = {
      version: (current?.version ?? 0) + 1,
      is_active: true,
      pinned,
      summary,
      facts: cleanedFacts,
      updated_at: now,
    };

    db.notes.push(newRec);
    await this.#save(db);

    return { changed: true, result: newRec };
  }

  /**
   * Chat once with the model, demonstrating streaming consumption.
   * Returns the final assistant message content.
   */
  async #chatOnce(
    args: { model: string; system: string; user: string },
  ): Promise<string> {
    const stream = this.#modelProvider.streamChat({
      model: args.model,
      maxTokens: this.#maxTokens,
      system: args.system,
      messages: [{
        role: "user",
        content: [{ text: args.user, type: "text" }],
        timestamp: new Date(),
      }],
    });

    const finalMessage = await stream.finalMessage();

    let finalText = "";
    for (const c of (finalMessage.content ?? [])) {
      if (c.type === "text" && "text" in c) {
        finalText += c.text;
      }
    }
    return (finalText || "").trim();
  }

  async #chatOnceJson(
    args: { model: string; system: string; user: string },
  ): Promise<Facts | null> {
    const raw = await this.#chatOnce(args);

    const tryParse = (s: string) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };

    const text = raw.trim();
    let obj = tryParse(text);

    if (!obj) {
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence?.[1]) obj = tryParse(fence[1].trim());
    }

    if (!obj) {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        obj = tryParse(text.slice(firstBrace, lastBrace + 1));
      }
    }

    return obj ?? {};
  }

  /**
   * Extract JSON from model output (handles raw JSON or fenced ```json blocks),
   * then validate shape and return an array of candidate Fact-like objects.
   */
  #safeParseFactsJSON(output: string): Array<Partial<Fact>> {
    const text = output.trim();

    const tryParse = (s: string): Facts | null => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };

    let obj = tryParse(text);

    if (!obj) {
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence?.[1]) obj = tryParse(fence[1].trim());
    }

    if (!obj) {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        obj = tryParse(text.slice(firstBrace, lastBrace + 1));
      }
    }

    const facts = Array.isArray(obj?.facts) ? obj.facts : [];

    return facts.filter((it: Fact) =>
      it && typeof it.k === "string" && typeof it.v === "string"
    );
  }
}
