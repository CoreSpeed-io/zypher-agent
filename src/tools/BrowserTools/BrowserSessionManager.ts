import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { getRandomId } from "./utils.ts";

type Session = {
  browser: Browser | null;
  context: BrowserContext;
  page: Page;
  lastUsed: number;
  userDataDir?: string;
};

const SESSIONS = new Map<string, Session>(); // sessionId -> Session
const IDLE_MS = 15 * 60 * 1000;

let _sweepIntervalId: number | undefined = undefined;

export async function openSession(opts: {
  sessionId?: string;
  persistent?: boolean;
  userDataDir?: string; // user data directory (when persistent=true)
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
}): Promise<{ sessionId: string; page: Page }> {
  const sid = opts.sessionId ?? getRandomId();
  if (SESSIONS.has(sid)) {
    const s = SESSIONS.get(sid)!;
    s.lastUsed = Date.now();
    return { sessionId: sid, page: s.page };
  }

  let context: BrowserContext;
  let browser: Browser | null = null;

  if (opts.persistent) {
    const userDataDir = opts.userDataDir ?? `./.user-data/${sid}`;
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      acceptDownloads: true,
      viewport: opts.viewport ?? { width: 1920, height: 1080 },
      deviceScaleFactor: opts.deviceScaleFactor,
    });
    const page = context.pages()[0] ?? await context.newPage();
    SESSIONS.set(sid, {
      browser: null,
      context,
      page,
      lastUsed: Date.now(),
      userDataDir,
    });
    // Start sweeper lazily
    if (typeof _sweepIntervalId === "undefined") {
      _sweepIntervalId = setInterval(() => {
        void sweepIdleSessions().catch(() => {
          // ignore
        });
      }, 60 * 1000) as unknown as number;
    }
    return { sessionId: sid, page };
  } else {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: opts.viewport ?? { width: 1920, height: 1080 },
      acceptDownloads: true,
      deviceScaleFactor: opts.deviceScaleFactor,
    });
    const page = await context.newPage();
    SESSIONS.set(sid, { browser, context, page, lastUsed: Date.now() });

    if (typeof _sweepIntervalId === "undefined") {
      _sweepIntervalId = setInterval(() => {
        void sweepIdleSessions().catch(() => {});
      }, 60 * 1000) as unknown as number;
    }
    return { sessionId: sid, page };
  }
}

export async function getPage(sessionId: string): Promise<Page> {
  const s = SESSIONS.get(sessionId);
  if (!s) throw new Error(`Session not found: ${sessionId}`);
  s.lastUsed = Date.now();
  // Create a new page if the current one is closed
  if (s.page.isClosed()) s.page = await s.context.newPage();
  return s.page;
}

export async function closeSession(sessionId: string) {
  const s = SESSIONS.get(sessionId);
  if (!s) return;
  try {
    if (s.browser) {
      await s.browser.close();
    } else {
      await s.context.close();
    }
  } finally {
    SESSIONS.delete(sessionId);
    if (SESSIONS.size === 0 && typeof _sweepIntervalId !== "undefined") {
      try {
        clearInterval(_sweepIntervalId as unknown as number);
      } catch (_e) {
        // ignore
      }
      _sweepIntervalId = undefined;
    }
  }
}

export function listSessions() {
  return Array.from(SESSIONS.keys());
}

export async function sweepIdleSessions() {
  const t = Date.now();
  for (const [sid, s] of SESSIONS) {
    if (t - s.lastUsed > IDLE_MS) {
      await closeSession(sid);
    }
  }
}
