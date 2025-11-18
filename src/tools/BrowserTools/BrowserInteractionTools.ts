import { z } from "zod";
import { ensureDir } from "@std/fs";
import { resolve } from "@std/path";
import type { Download, Page } from "playwright";
import {
  createTool,
  type Tool,
  type ToolExecutionContext,
  type ToolResult,
} from "../mod.ts";
import { getPage } from "./BrowserSessionManager.ts";
import { ensureParentDir } from "./utils.ts";

/** Create browser interaction tools for hovering, scrolling, clicking,
 * file uploading, downloading, and text input.
 *
 * @param downloadDir - The default directory where downloads will be saved.
 *  Defaults to ./downloads.
 * @returns An object containing the configured browser interaction tools
 */
export function createBrowserInteractionTools(
  downloadDir: string = "./downloads",
): {
  BrowserHoverTool: Tool<{
    sessionId: string;
    explanation: string;
    selector: string;
  }>;
  BrowserScrollTool: Tool<{
    sessionId: string;
    explanation: string;
    byY?: number;
    to?: "top" | "bottom";
    stepDelayMs?: number;
  }>;
  BrowserClickTool: Tool<{
    sessionId: string;
    explanation: string;
    selector: string;
    button?: "left" | "right" | "middle";
    clickCount?: number;
    force?: boolean;
    timeoutMs?: number;
    waitForNavigation?: boolean;
    waitUntil?: "load" | "domcontentloaded" | "networkidle";
  }>;
  BrowserFileUploadTool: Tool<{
    sessionId: string;
    explanation: string;
    selector: string;
    paths: string[];
  }>;
  BrowserDownloadTool: Tool<{
    sessionId: string;
    explanation: string;
    triggerSelector?: string;
    triggerJs?: string;
    outDir?: string;
    filename?: string;
    timeoutMs?: number;
  }>;
  BrowserInputTool: Tool<{
    sessionId: string;
    explanation: string;
    text?: string;
    selector?: string;
    clear?: boolean;
    delayMs?: number;
  }>;
} {
  const BrowserHoverTool = createTool({
    name: "browser_hover",
    description: `Hover an element in the current shared browser session.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe("One sentence explanation of the purpose of this hover."),
      selector: z
        .string()
        .describe("CSS selector of the element to hover"),
    }),
    execute: async (params): Promise<ToolResult> => {
      const page = await getPage(params.sessionId);
      await page.hover(params.selector);
      return `hovered: ${params.selector}`;
    },
  });

  const BrowserScrollTool = createTool({
    name: "browser_scroll",
    description:
      `Scroll the current shared browser session page by pixels or to top/bottom.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe("One sentence explanation of the purpose of this scroll."),
      byY: z
        .number()
        .optional()
        .describe("Positive=down, negative=up."),
      to: z
        .enum(["top", "bottom"])
        .optional()
        .describe(
          "Optional, scroll to top or bottom.",
        ),
      stepDelayMs: z
        .number()
        .int()
        .nonnegative()
        .default(0)
        .optional()
        .describe(
          "Optional delay in milliseconds after scrolling.",
        ),
    }),
    execute: async (params): Promise<ToolResult> => {
      const page = await getPage(params.sessionId);
      if (params.to) {
        await page.evaluate((pos) => {
          if (pos === "top") globalThis.scrollTo(0, 0);
          else {globalThis.scrollTo(
              0,
              document.documentElement.scrollHeight ||
                document.body.scrollHeight || 0,
            );}
        }, params.to);
      } else if (typeof params.byY === "number") {
        await page.evaluate((dy) => globalThis.scrollBy(0, dy), params.byY);
      } else {
        return "provide byY or to";
      }
      if (params.stepDelayMs) await page.waitForTimeout(params.stepDelayMs);
      const y = await page.evaluate(() => globalThis.scrollY || 0);
      return `scrolled, currentY=${y}`;
    },
  });

  const BrowserClickTool = createTool({
    name: "browser_click",
    description:
      `Click a selector in the current shared browser session with flexible options.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this click.",
        ),
      selector: z
        .string()
        .describe("CSS selector to click"),
      button: z
        .union([
          z.literal("left"),
          z.literal("right"),
          z.literal("middle"),
        ])
        .optional()
        .describe("Mouse button to use"),
      clickCount: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Number of clicks",
        ),
      force: z
        .boolean()
        .optional()
        .describe("Force the click"),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Click/navigation timeout",
        ),
      waitForNavigation: z
        .boolean()
        .optional()
        .describe(
          "If true, wait for navigation after click",
        ),
      waitUntil: z
        .enum(["load", "domcontentloaded", "networkidle"])
        .optional()
        .describe("Navigation waitUntil when waiting"),
    }),
    execute: async (params): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const loc = page.locator(params.selector);
        await loc.waitFor({ state: "visible", timeout: params.timeoutMs });

        const clickOptions = {
          button: params.button,
          clickCount: params.clickCount,
          force: params.force,
          timeout: params.timeoutMs,
        };

        if (params.waitForNavigation) {
          try {
            await Promise.all([
              page.waitForNavigation({
                waitUntil: params.waitUntil,
                timeout: params.timeoutMs,
              }).catch(
                () => null,
              ),
              loc.click(clickOptions),
            ]);
          } catch {
            // handled below
          }
        } else {
          await loc.click(clickOptions);
        }

        return JSON.stringify(
          { ok: true, selector: params.selector, url: page.url() },
          null,
          2,
        );
      } catch (err) {
        return `Failed to click ${params.selector}: ${
          (err as Error)?.message ?? err
        }`;
      }
    },
  });

  const BrowserFileUploadTool = createTool({
    name: "browser_file_upload",
    description:
      `Set files into an <input type="file"> element in the current shared browser session.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this file upload.",
        ),
      selector: z
        .string()
        .describe("CSS selector for the file input element"),
      paths: z
        .array(z.string())
        .min(1)
        .describe("Array of local file paths"),
    }),
    execute: async (params, ctx: ToolExecutionContext): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const loc = page.locator(params.selector);
        await loc.waitFor({ state: "attached" });
        const targets = params.paths.map((p) =>
          resolve(ctx.workingDirectory, p)
        );
        await page.setInputFiles(params.selector, targets);
        return JSON.stringify(
          { ok: true, selector: params.selector, paths: params.paths },
          null,
          2,
        );
      } catch (err) {
        return `Failed to upload files to ${params.selector}: ${
          (err as Error)?.message ?? err
        }`;
      }
    },
  });

  const BrowserDownloadTool = createTool({
    name: "browser_download",
    description:
      `Wait for and save the next download triggered in the current shared browser session.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this download.",
        ),
      triggerSelector: z
        .string()
        .optional()
        .describe(
          "Optional CSS selector to click to trigger the download.",
        ),
      triggerJs: z
        .string()
        .optional()
        .describe(
          "Optional JavaScript code to execute to trigger the download.",
        ),
      filename: z
        .string()
        .optional()
        .describe(
          "Optional suggested filename for the downloaded file.",
        ),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Optional timeout in milliseconds for the download.",
        ),
    }),
    execute: async (
      params,
      ctx: ToolExecutionContext,
    ): Promise<ToolResult> => {
      let page: Page | undefined;
      let finalPath: string | undefined = undefined;
      let finalName: string | undefined = undefined;
      let _capturedEvalResult: unknown = undefined;
      let downloadPromise: Promise<Download> | undefined = undefined;
      try {
        page = await getPage(params.sessionId);
        const ctxOutDir = resolve(
          ctx.workingDirectory,
          downloadDir,
        );
        await ensureDir(ctxOutDir);

        downloadPromise = page.waitForEvent("download", {
          timeout: params.timeoutMs,
        });

        if (params.triggerSelector) {
          const loc = page.locator(params.triggerSelector);
          await loc.waitFor({ state: "visible", timeout: params.timeoutMs });
          await loc.click({ timeout: params.timeoutMs });
        } else if (params.triggerJs) {
          _capturedEvalResult = await page.evaluate(params.triggerJs as string);
        } else {
          return `❌ provide triggerSelector or triggerJs to start a download`;
        }

        // fallback filename
        finalName = params.filename || `download_${Date.now()}`;
        finalPath = `${ctxOutDir.replace(/\\/g, "/")}/${finalName}`;
        await ensureParentDir(finalPath);

        const download = await downloadPromise;

        // suggested filename
        try {
          const suggested = await download.suggestedFilename();
          if (suggested) {
            finalName = params.filename || suggested || finalName;
            finalPath = `${ctxOutDir.replace(/\\/g, "/")}/${finalName}`;
            await ensureParentDir(finalPath);
          }
        } catch {
          // ignore
        }

        await download.saveAs(finalPath);

        let size: number | null = null;

        const st = await Deno.stat(finalPath);
        size = st.size ?? null;

        return JSON.stringify(
          {
            savedPath: finalPath,
            filename: finalName,
            url: download.url(),
            size,
          },
          null,
          2,
        );
      } catch (err) {
        try {
          downloadPromise?.catch(() => {});
        } catch (_e) {
          // ignore
        }
        // Fallback to captured eval result or in-page href fetch
        try {
          if (typeof _capturedEvalResult === "string") {
            const s = _capturedEvalResult as string;
            if (s.startsWith("data:")) {
              const m = s.match(/^data:([^;]+);base64,(.*)$/);
              const b64 = m ? m[2] : null;
              if (b64 && finalPath) {
                const raw = atob(b64);
                const u8 = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
                await Deno.writeFile(finalPath, u8);
                return JSON.stringify(
                  { savedPath: finalPath, filename: finalName, url: "data:" },
                  null,
                  2,
                );
              }
            } else {
              try {
                const raw = atob(s);
                if (finalPath) {
                  const u8 = new Uint8Array(raw.length);
                  for (let i = 0; i < raw.length; i++) {
                    u8[i] = raw.charCodeAt(i);
                  }
                  await Deno.writeFile(finalPath, u8);
                  return JSON.stringify(
                    {
                      savedPath: finalPath,
                      filename: finalName,
                      url: "inline",
                    },
                    null,
                    2,
                  );
                }
              } catch (_e) {
                // not base64
              }
            }
          }

          if (params.triggerSelector) {
            const maybeHref = await page!.evaluate((sel: string) => {
              const el = document.querySelector(sel) as
                | HTMLAnchorElement
                | null;
              return el ? el.href : null;
            }, params.triggerSelector as string);

            if (maybeHref) {
              const base64 = await page!.evaluate(async (href: string) => {
                try {
                  const r = await fetch(href);
                  const buf = await r.arrayBuffer();
                  let binary = "";
                  const bytes = new Uint8Array(buf);
                  for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                  }
                  return btoa(binary);
                } catch (_e) {
                  return null;
                }
              }, maybeHref as string);

              if (base64) {
                const data = atob(base64);
                const u8 = new Uint8Array(data.length);
                for (let i = 0; i < data.length; i++) {
                  u8[i] = data.charCodeAt(i);
                }
                if (finalPath) {
                  await Deno.writeFile(finalPath, u8);
                  return JSON.stringify(
                    {
                      savedPath: finalPath,
                      filename: finalName,
                      url: maybeHref,
                    },
                    null,
                    2,
                  );
                }
              }
            }
          }
        } catch (_e) {
          // ignore fallback errors
        }
        return `Failed to download: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  const BrowserInputTool = createTool({
    name: "browser_input",
    description:
      `Type text with the keyboard in the current shared browser session.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this input.",
        ),
      text: z
        .string()
        .optional()
        .describe("Text to type."),
      selector: z
        .string()
        .optional()
        .describe(
          "Optional unique selector string to identify the target element.",
        ),
      clear: z
        .boolean()
        .default(false)
        .optional()
        .describe(
          "If true, clear the target field before typing.",
        ),
      delayMs: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
          "Per-character delay when typing (ms).",
        ),
    }),
    execute: async (params): Promise<ToolResult> => {
      const page = await getPage(params.sessionId);

      if (params.selector) {
        const loc = page.locator(params.selector);
        await loc.waitFor({ state: "visible" });
        await loc.click({ force: true });
        try {
          await loc.evaluate((el: HTMLElement) => el.focus());
        } catch (_e) {
          // ignore focus errors
        }
      } else {
        const hasActive = await page.evaluate(() =>
          !!document.activeElement && document.activeElement !== document.body
        );
        if (!hasActive) {
          return "No selector provided and no focused element to type into.";
        }
      }

      if (params.clear) {
        const cleared = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return "no-active";
          const isCE = el.getAttribute("contenteditable") === "" ||
            el.getAttribute("contenteditable") === "true";
          if (
            el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          ) {
            el.value = "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return "cleared-value";
          }
          if (isCE) {
            try {
              (el as HTMLElement).innerText = "";
              (el as HTMLElement).textContent = "";
              el.dispatchEvent(new Event("input", { bubbles: true }));
              return "cleared-contenteditable";
            } catch (_e) {
              // ignore DOM mutation errors
            }
          }
          return "fallback";
        });

        if (cleared === "fallback") {
          try {
            await page.keyboard.press("Control+A");
            await page.keyboard.press("Delete");
          } catch (_e) {
            // ignore
          }
          try {
            await page.keyboard.press("Meta+A");
            await page.keyboard.press("Delete");
          } catch (_e) {
            // ignore
          }
        }
      }

      if (typeof params.text === "string" && params.text.length > 0) {
        await page.keyboard.type(params.text, { delay: params.delayMs });
      }

      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return { focused: false };
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        const id = el.id || null;
        const classes = el.className || null;
        return { focused: true, tag, role, id, classes };
      });

      return `typed${
        params.text ? ` (${params.text.length} chars)` : ""
      } into ${
        info.focused ? `${info.tag}${info.id ? `#${info.id}` : ""}` : "unknown"
      }${params.selector ? ` [selector=${params.selector}]` : ""}`;
    },
  });

  return {
    BrowserHoverTool,
    BrowserScrollTool,
    BrowserClickTool,
    BrowserFileUploadTool,
    BrowserDownloadTool,
    BrowserInputTool,
  };
}
