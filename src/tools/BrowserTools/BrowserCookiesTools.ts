import { z } from "zod";
import type { Cookie } from "playwright";
import { createTool, type Tool, type ToolResult } from "../mod.ts";
import { getPage } from "./BrowserSessionManager.ts";

/** * Create browser cookies tools to get, set, and clear cookies within a browser session.
 *
 * @returns An object containing the configured browser cookies tools
 */

export function createBrowserCookiesTools(): {
  BrowserGetCookiesTool: Tool<{
    sessionId: string;
    explanation: string;
    urls?: string[];
  }>;
  BrowserSetCookiesTool: Tool<{
    sessionId: string;
    explanation: string;
    cookies: Record<string, unknown>[];
  }>;
  BrowserClearCookiesTool: Tool<{
    sessionId: string;
    explanation: string;
  }>;
} {
  const BrowserGetCookiesTool = createTool({
    name: "browser_get_cookies",
    description:
      `Get cookies for the current session (optionally scoped to URLs).`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of getting cookies.",
        ),
      urls: z
        .array(z.string().url())
        .optional()
        .describe("Optional list of URLs to scope the cookies"),
    }),
    execute: async (params): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const ctx = page.context();
        const cookies = await ctx.cookies(params.urls);
        return JSON.stringify({ ok: true, cookies });
      } catch (err) {
        return `Failed to get cookies: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  const BrowserSetCookiesTool = createTool({
    name: "browser_set_cookies",
    description:
      `Set cookies into the browser context. Accepts Playwright cookie objects (name, value, domain, path, etc.).`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of setting cookies.",
        ),
      cookies: z
        .array(z.record(z.unknown()))
        .describe("Array of cookie objects to set"),
    }),
    execute: async (params): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const ctx = page.context();
        // Playwright expects array of cookies
        await ctx.addCookies(params.cookies as unknown as Cookie[]);
        return JSON.stringify({ ok: true, count: params.cookies.length });
      } catch (err) {
        return `Failed to set cookies: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  const BrowserClearCookiesTool = createTool({
    name: "browser_clear_cookies",
    description:
      `Clear all cookies in the current browser context for the session.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of clearing cookies.",
        ),
    }),
    execute: async (params): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const ctx = page.context();
        await ctx.clearCookies();
        return JSON.stringify({ ok: true });
      } catch (err) {
        return `Failed to clear cookies: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  return {
    BrowserGetCookiesTool,
    BrowserSetCookiesTool,
    BrowserClearCookiesTool,
  };
}
