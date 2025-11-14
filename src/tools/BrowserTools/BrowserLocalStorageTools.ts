import { z } from "zod";
import type { Cookie } from "playwright";
import { resolve } from "@std/path";
import {
  createTool,
  type Tool,
  type ToolExecutionContext,
  type ToolResult,
} from "../mod.ts";
import { getPage } from "./BrowserSessionManager.ts";
import { ensureParentDir } from "./utils.ts";

/**
 * Create browser local storage tools to get, set, clear localStorage, and import/export storage state within a browser session.
 *
 * @param outPath - The default output path for exported storage state files
 * @returns An object containing the configured browser local storage tools
 */

export function createBrowserLocalStorageTools(
  outPath: string = "./.local_storage_states",
): {
  BrowserExportStorageStateTool: Tool<{
    sessionId: string;
    explanation: string;
  }>;
  BrowserImportStorageStateTool: Tool<{
    sessionId: string;
    explanation: string;
    statePath: string;
  }>;
  BrowserGetLocalStorageTool: Tool<{
    sessionId: string;
    explanation: string;
    origin?: string;
  }>;
  BrowserSetLocalStorageTool: Tool<{
    sessionId: string;
    explanation: string;
    items: Record<string, string>;
    origin?: string;
  }>;
  BrowserClearLocalStorageTool: Tool<{
    sessionId: string;
    explanation: string;
    origin?: string;
  }>;
} {
  const BrowserExportStorageStateTool = createTool({
    name: "browser_export_storage_state",
    description:
      `Export the current browser context storage state (cookies + localStorage/sessionStorage) to a file or return as JSON.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of exporting storage state.",
        ),
    }),
    execute: async (params, ctx: ToolExecutionContext): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const context = page.context();
        const state = await context.storageState();
        // capture current page's localStorage entries
        let pageLocalStorage: Record<string, string> | null = null;
        try {
          pageLocalStorage = await page.evaluate(() => {
            const out: Record<string, string> = {};
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k) out[k] = localStorage.getItem(k) ?? "";
              }
            } catch {
              // ignore
            }
            return out;
          });
        } catch {
          pageLocalStorage = null;
        }
        await ensureParentDir(outPath);
        // Write combined state + localStorage snapshot
        const toWrite = {
          storageState: state,
          localStorageByOrigin: { [page.url()]: pageLocalStorage },
        };
        const resolvedOutPath = resolve(ctx.workingDirectory, outPath);
        await Deno.writeTextFile(
          resolvedOutPath,
          JSON.stringify(toWrite, null, 2),
        );
        return JSON.stringify({ ok: true, path: outPath });
      } catch (err) {
        return `Failed to export storage state: ${
          (err as Error)?.message ?? err
        }`;
      }
    },
  });

  const BrowserImportStorageStateTool: Tool<{
    sessionId: string;
    statePath: string;
  }> = createTool({
    name: "browser_import_storage_state",
    description:
      `Import cookies and localStorage from a Playwright storageState JSON file into the current session.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of importing storage state.",
        ),
      statePath: z
        .string()
        .describe("Path to the storage state JSON file"),
    }),
    execute: async (params, ctx: ToolExecutionContext): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const context = page.context();
        // Read file
        const resolvedStatePath = resolve(
          ctx.workingDirectory,
          params.statePath,
        );
        const txt = await Deno.readTextFile(resolvedStatePath);
        const parsed = JSON.parse(txt) as unknown;

        const parsedObj = parsed as Record<string, unknown> | null;
        const state = parsedObj &&
            Object.prototype.hasOwnProperty.call(parsedObj, "storageState")
          ? (parsedObj["storageState"] as unknown)
          : parsed;
        const localStorageByOrigin = parsedObj &&
            Object.prototype.hasOwnProperty.call(
              parsedObj,
              "localStorageByOrigin",
            )
          ? (parsedObj["localStorageByOrigin"] as Record<string, unknown>)
          : undefined;

        const st = state as { cookies?: unknown[]; origins?: unknown[] };
        if (Array.isArray(st.cookies)) {
          await context.addCookies(st.cookies as unknown as Cookie[]);
        }

        // state.origins contains localStorage/sessionStorage entries
        if (Array.isArray(st.origins)) {
          for (const origin of st.origins as Array<unknown>) {
            const o = origin as {
              origin?: string;
              localStorage?: Array<{ name: string; value: string }>;
            };
            const originUrl = o.origin;
            const lsItems = o.localStorage;
            if (
              Array.isArray(lsItems) && lsItems.length > 0 &&
              typeof originUrl === "string"
            ) {
              // avoid execution-context-destroyed issues when navigating the main page
              try {
                const targetOrigin = (() => {
                  try {
                    return new URL(originUrl).origin;
                  } catch {
                    return originUrl;
                  }
                })();

                const tempPage = await context.newPage();
                try {
                  // navigate to the origin root
                  await tempPage.goto(`${targetOrigin}/`, {
                    waitUntil: "domcontentloaded",
                    timeout: 5000,
                  }).catch(() => null);

                  await tempPage.evaluate(
                    (items: Array<{ name: string; value: string }>) => {
                      for (const it of items) {
                        try {
                          (globalThis as unknown as { localStorage?: Storage })
                            .localStorage?.setItem(it.name, it.value);
                        } catch (_e) {
                          // ignore
                        }
                      }
                    },
                    lsItems,
                  );
                } catch {
                  // ignore
                } finally {
                  try {
                    await tempPage.close();
                  } catch {
                    // ignore
                  }
                }
              } catch {
                // ignore
              }
            }
          }
        }

        if (localStorageByOrigin && typeof localStorageByOrigin === "object") {
          for (
            const [originUrl, items] of Object.entries(localStorageByOrigin)
          ) {
            if (!items || typeof items !== "object") continue;
            try {
              // normalize to an origin
              let targetOrigin = originUrl;
              try {
                targetOrigin = new URL(originUrl).origin;
              } catch {
                // leave as-is
              }

              const tempPage = await context.newPage();
              try {
                await tempPage.goto(`${targetOrigin}/`, {
                  waitUntil: "domcontentloaded",
                  timeout: 5000,
                }).catch(() => null);

                await tempPage.evaluate((pairs: Record<string, string>) => {
                  try {
                    for (const k of Object.keys(pairs)) {
                      localStorage.setItem(k, pairs[k]);
                    }
                  } catch (_e) {
                    // ignore
                  }
                }, items as Record<string, string>);
              } catch {
                // ignore
              } finally {
                try {
                  await tempPage.close();
                } catch {
                  // ignore
                }
              }
            } catch {
              // ignore
            }
          }
        }

        return JSON.stringify({ ok: true });
      } catch (err) {
        return `Failed to import storage state: ${
          (err as Error)?.message ?? err
        }`;
      }
    },
  });

  const BrowserGetLocalStorageTool = createTool({
    name: "browser_get_local_storage",
    description:
      `Get localStorage key/value pairs for the current page origin or navigate to provided origin.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of getting localStorage.",
        ),
      origin: z
        .string()
        .optional()
        .describe(
          "Optional origin URL to navigate to before getting localStorage.",
        ),
    }),
    execute: async (params): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        if (params.origin) {
          // navigate to origin root
          try {
            await page.goto(params.origin, { waitUntil: "domcontentloaded" });
          } catch {
            // ignore
          }
        }
        const items = await page.evaluate(() => {
          const out: Record<string, string> = {};
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k) out[k] = localStorage.getItem(k) ?? "";
            }
          } catch {
            // ignore
          }
          return out;
        });

        return JSON.stringify(
          {
            ok: true,
            localStorage: items,
            origin: page.url(),
          },
        );
      } catch (err) {
        return `Failed to read localStorage: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  const BrowserSetLocalStorageTool = createTool({
    name: "browser_set_local_storage",
    description:
      `Set multiple localStorage key/value pairs for the current page origin or navigate to provided origin.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of setting localStorage.",
        ),
      items: z
        .record(z.string())
        .describe("Key/value pairs to set in localStorage."),
      origin: z
        .string()
        .optional()
        .describe(
          "Optional origin URL to navigate to before setting localStorage.",
        ),
    }),
    execute: async (params): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        if (params.origin) {
          try {
            await page.goto(params.origin, { waitUntil: "domcontentloaded" });
          } catch {
            // ignore
          }
        }
        await page.evaluate((pairs: Record<string, string>) => {
          try {
            for (const k of Object.keys(pairs)) {
              localStorage.setItem(k, pairs[k]);
            }
          } catch {
            // ignore
          }
        }, params.items);

        return JSON.stringify(
          {
            ok: true,
            count: Object.keys(params.items).length,
            origin: page.url(),
          },
        );
      } catch (err) {
        return `Failed to set localStorage: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  const BrowserClearLocalStorageTool = createTool({
    name: "browser_clear_local_storage",
    description:
      `Clear localStorage for the current page origin or navigate to provided origin and clear it.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of clearing localStorage.",
        ),
      origin: z
        .string()
        .optional()
        .describe(
          "Optional origin URL to navigate to before clearing localStorage.",
        ),
    }),
    execute: async (params): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        if (params.origin) {
          try {
            await page.goto(params.origin, { waitUntil: "domcontentloaded" });
          } catch {
            // ignore
          }
        }
        await page.evaluate(() => {
          try {
            localStorage.clear();
          } catch (_e) { /* ignore */ }
        });
        return JSON.stringify({
          ok: true,
          origin: page.url(),
        });
      } catch (err) {
        return `Failed to clear localStorage: ${
          (err as Error)?.message ?? err
        }`;
      }
    },
  });

  return {
    BrowserExportStorageStateTool,
    BrowserImportStorageStateTool,
    BrowserGetLocalStorageTool,
    BrowserSetLocalStorageTool,
    BrowserClearLocalStorageTool,
  };
}
