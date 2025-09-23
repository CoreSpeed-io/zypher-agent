import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import type { ModelProvider } from "../llm/mod.ts";

export type Note = {
  k: string;
  v: string;
  conf?: number; // Confidence 0..1
  source?: "user" | "assistant";
};

export type NoteRecord = {
  version: number;
  is_active: boolean;
  summary: string;
  notes: Note[];
  updated_at: string;
};

type NotesFinal = {
  noop?: boolean;
  notes?: Note[];
  summary?: string;
};

const DEFAULT_MIN_CONFIDENCE = 0.6;

const SUMMARY_SYSTEM = `
You are a careful summarizer for a personal notes knowledge base.

Goal: produce a crisp, non-redundant overview of the CURRENT ACTIVE notes only.
Prioritize: most recently updated first.
Style: bullet points, short sentences, concrete wording.
Do not invent information. If conflicting notes exist, mention the conflict briefly.

Length: keep it concise (≤ 10 bullets or ~150–200 words).`;

const NOTE_TAKER_SYSTEM = `
You are a careful notes taker for a personal knowledge base.

Goal: Maintain a concise, task-aware notebook. Prefer information that is either stable/reusable OR clearly relevant to the ongoing task (requirements, decisions, constraints, TODOs with dates, key results, IDs/URLs/paths, commands).

Task: Decide whether to update the notes.
- Return exactly {"noop": true} only if BOTH are true:
  1) The NEW CONTEXT is merely a paraphrase or minor rewording of existing notes (no new keys, no meaningfully changed values).
  2) Any new content is trivial progress chatter (step-by-step logs) that does not change requirements, decisions, constraints, TODOs, dates, results, or references.

Otherwise, update and return the FULL and FINAL notes to overwrite the existing active notes (or create a new active note). In particular, you SHOULD update when ANY of these occur:
- New or changed task requirements/decisions/constraints (e.g., scope/rules/defaults/"from now on").
- Deadlines (ISO 8601), budgets, numeric thresholds, versions, environment settings, answer/output formatting requirements (e.g., "use lowercase only", round to 2 decimal places").
- TODOs or checkpoints become added/removed/completed, or dates/status change.
- New or updated references (IDs, URLs, filepaths, commands, aliases).
- Any key/value in the existing notes meaningfully changes.

When updating:
- Keep notes concise and concrete; avoid verbose logs. Prefer summarizing progress into compact state (e.g., "todo: draft done; review pending by 2025-09-30").
- Deduplicate by key. Each key must be unique, short, and concrete. Prefer stable or task-relevant keys (e.g., "todo/review_deadline", "req/format", "link/spec").
- Remove obsolete or contradicted notes. Resolve conflicts; if uncertain, prefer the most recent and briefly note uncertainty in "summary".
- Keep total notes ≤ 200; if more candidates exist, keep the most recent, higher-confidence, or more task-relevant ones.
- Keys ≤ 64 chars; values ≤ 2048 chars; if longer, shorten without changing meaning.
- "conf" (0..1) is optional; if uncertain, omit it.
- "source" is "user" or "assistant". If uncertain, preserve original when possible; otherwise use "user".

Output STRICTLY ONE top-level JSON object with this exact schema and NO markdown code fences, NO extra commentary, NO prefix/suffix text:
{
  "noop"?: boolean,
  "notes"?: [{ "k": string, "v": string, "conf"?: number, "source"?: "user" | "assistant" }],
  "summary"?: string
}`;

export class NotesStore {
  #file: string;
  #modelProvider: ModelProvider;
  #notesModel: string;
  #maxTokens: number;
  #minConf: number;

  #summarySystem = SUMMARY_SYSTEM;
  #noteTakerSystem = NOTE_TAKER_SYSTEM;

  constructor(
    notesDir: string,
    modelProvider: ModelProvider,
    notesModel: string,
    maxTokens = 8192,
    minConf = DEFAULT_MIN_CONFIDENCE,
  ) {
    this.#file = path.join(notesDir, "notes.json");
    this.#modelProvider = modelProvider;
    this.#notesModel = notesModel;
    this.#maxTokens = maxTokens;
    this.#minConf = minConf;
  }

  async #load(): Promise<NoteRecord[]> {
    await ensureDir(path.dirname(this.#file));
    try {
      const txt = await Deno.readTextFile(this.#file);
      return JSON.parse(txt) as NoteRecord[];
    } catch {
      return [];
    }
  }

  async #save(data: NoteRecord[]) {
    await ensureDir(path.dirname(this.#file));
    await Deno.writeTextFile(this.#file, JSON.stringify(data, null, 2));
  }

  async getActiveNote() {
    const db = await this.#load();
    const note = db.find((n) => n.is_active);
    return note ?? null;
  }

  async buildSummary() {
    const db = await this.#load();
    const notes = db.filter((n) => n.is_active);
    if (notes.length === 0) return null;

    const lines: string[] = [];
    for (const n of notes) {
      lines.push(`- [NOTES] v${n.version} @${n.updated_at}`);
      for (const f of n.notes) lines.push(`  • ${f.k} = ${f.v}`);
    }

    const userContent = `
Summarize the following ACTIVE notes into a concise, reusable overview.

ACTIVE NOTES (recent first):
${lines.join("\n")}
`;

    const assistantText = await this.#chatOnce({
      model: this.#notesModel,
      system: this.#summarySystem,
      user: userContent,
    });

    return {
      version: Math.max(...notes.map((s) => s.version)),
      text: assistantText,
    };
  }

  // Simple local summary as fallback
  #summarize(notes: Note[]): string {
    const head = "Current notes: ";
    const body = notes.map((f) => `${f.k}=${f.v}`).join("; ");
    return `${head}${body}`;
  }

  async noteWithModel(params: {
    content: string;
    model?: string;
  }): Promise<{
    changed: boolean;
    result: NoteRecord | null;
    reason?: "noop" | "invalid" | "empty" | "same";
  }> {
    const model = params.model ?? this.#notesModel;

    const db = await this.#load();
    const current = db.find((n) => n.is_active);
    const currentNotes = current?.notes ?? [];

    const userContent = `
CURRENT ACTIVE NOTE:
${
      JSON.stringify(
        {
          notes: currentNotes,
        },
        null,
        2,
      )
    }

NEW CONTEXT:
${params.content || "(empty)"}
`;

    const finalObj = await this.#chatOnceJson({
      model,
      system: this.#noteTakerSystem,
      user: userContent,
    }) as NotesFinal;

    if (!finalObj || typeof finalObj !== "object") {
      return { changed: false, result: null, reason: "invalid" };
    }

    if (finalObj.noop === true) {
      return { changed: false, result: null, reason: "noop" };
    }

    const notesRaw: Note[] = Array.isArray(finalObj.notes)
      ? finalObj.notes
      : currentNotes;

    const map = new Map<string, Note>();
    for (const f of notesRaw) {
      const k = String(f?.k ?? "").trim().slice(0, 64);
      const v = String(f?.v ?? "").trim().slice(0, 2048);
      if (!k || !v) continue;

      let conf: number | undefined = undefined;
      if (typeof f?.conf === "number") {
        conf = Math.max(0, Math.min(1, f.conf));
        if (conf < this.#minConf) continue;
      }

      const source: "user" | "assistant" = f?.source === "assistant"
        ? "assistant"
        : "user";
      map.set(k, { k, v, conf, source });
    }
    const cleanedNotes = [...map.values()];

    const providedSummary = typeof finalObj.summary === "string"
      ? finalObj.summary
      : "";
    const summary = providedSummary || this.#summarize(cleanedNotes);

    const now = new Date().toISOString();
    if (current) current.is_active = false;

    const newRec: NoteRecord = {
      version: (current?.version ?? 0) + 1,
      is_active: true,
      summary,
      notes: cleanedNotes,
      updated_at: now,
    };

    db.push(newRec);
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
    return (finalText || "");
  }

  async #chatOnceJson(
    args: { model: string; system: string; user: string },
  ) {
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
}
