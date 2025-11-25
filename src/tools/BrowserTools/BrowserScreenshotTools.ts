import { z } from "zod";
import { ensureDir } from "@std/fs";
import { resolve } from "@std/path";
import {
  createTool,
  type Tool,
  type ToolExecutionContext,
  type ToolResult,
} from "../mod.ts";
import { getPage } from "./BrowserSessionManager.ts";
import { nowStamp, sanitizeName } from "./utils.ts";

/**
 * Create browser screenshot tools with an optional screenshot directory
 *
 * @param screenshotDir - The directory where screenshots will be saved.
 *  Defaults to ./screenshots if not provided.
 * @returns An object containing the configured browser screenshot tools
 */

export function createBrowserScreenshotTools(
  screenshotDir: string = "./screenshots",
): {
  BrowserInteractivesScreenshotTool: Tool<{
    sessionId: string;
    explanation: string;
  }>;
  BrowserElementScreenshotTool: Tool<{
    sessionId: string;
    explanation: string;
    selector?: string;
  }>;
} {
  const BrowserInteractivesScreenshotTool = createTool({
    name: "browser_interactives_screenshot",
    description:
      `Detect all interactive elements in the CURRENT shared browser session's viewport, draw colored boxes with numbered labels, and save a viewport-only screenshot.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe(
          "ID of the existing browser session",
        ),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this screenshot.",
        ),
    }),
    execute: async (params, ctx: ToolExecutionContext): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const resolvedScreenshotDir = resolve(
          ctx.workingDirectory,
          screenshotDir,
        );
        await ensureDir(resolvedScreenshotDir);
        const pageUrl = page.url() || "about:blank";
        const finalPath = screenshotPath(
          resolvedScreenshotDir,
          pageUrl,
        );

        // random runId
        const runId = `run_${Date.now().toString(36)}_${
          Math.random().toString(36).slice(2, 8)
        }`;

        // elements, annotate, and overlay
        const { items } = await page.evaluate((runId: string) => {
          const baseSelector = [
            "a[href]",
            "button",
            "input:not([type='hidden'])",
            "select",
            "textarea",
            "summary",
            "[role='button']",
            "[role='link']",
            "[role='checkbox']",
            "[role='switch']",
            "[role='menuitem']",
            "[role='tab']",
            "[role='treeitem']",
            "[tabindex]:not([tabindex='-1'])",
            "[contenteditable='']",
            "[contenteditable='true']",
            "[aria-controls]",
          ].join(",");

          const candidates = Array.from(
            document.querySelectorAll<HTMLElement>(baseSelector),
          )
            .filter((el) => intersectsViewport(el) && isInteractiveElement(el));

          const COLORS = [
            "#FF3B30",
            "#FF9500",
            "#FFCC00",
            "#34C759",
            "#5AC8FA",
            "#007AFF",
            "#AF52DE",
            "#FF2D55",
            "#BF5AF2",
            "#64D2FF",
            "#30D158",
            "#FFD60A",
          ];
          const zBase = 2147483640;

          // remove old overlay if any
          const OLD_ID = "__interactive_overlay_container__";
          const existed = document.getElementById(OLD_ID);
          if (existed && existed.parentElement) {
            existed.parentElement.removeChild(existed);
          }

          // create overlay container
          const overlay = document.createElement("div");
          overlay.id = OLD_ID;
          overlay.style.position = "fixed";
          overlay.style.left = "0";
          overlay.style.top = "0";
          overlay.style.width = "100%";
          overlay.style.height = "100%";
          overlay.style.pointerEvents = "none";
          overlay.style.zIndex = String(zBase);
          document.documentElement.appendChild(overlay);

          candidates.forEach((el, idx) => {
            const id = String(idx + 1);
            const r = el.getBoundingClientRect();
            const color = COLORS[idx % COLORS.length];

            el.setAttribute("data-interactive-run", runId);
            el.setAttribute("data-interactive-id", id);

            // frame
            const frame = document.createElement("div");
            frame.style.position = "fixed";
            frame.style.left = `${Math.max(0, r.left)}px`;
            frame.style.top = `${Math.max(0, r.top)}px`;
            frame.style.width = `${Math.max(0, r.width)}px`;
            frame.style.height = `${Math.max(0, r.height)}px`;
            frame.style.border = `2px solid ${color}`;
            frame.style.borderRadius = "4px";
            frame.style.pointerEvents = "none";
            frame.style.zIndex = String(zBase + 1);
            overlay.appendChild(frame);

            // label
            const label = document.createElement("div");
            label.textContent = id;
            label.style.position = "fixed";
            label.style.left = `${Math.max(0, r.left)}px`;
            label.style.top = `${Math.max(0, r.top)}px`;
            label.style.transform = `translateY(-100%)`;
            label.style.background = color;
            label.style.color = "#FFFFFF";
            label.style.font = "normal 12px/1.1 sans-serif";
            label.style.padding = "2px 4px";
            label.style.borderRadius = "4px";
            label.style.pointerEvents = "none";
            label.style.zIndex = String(zBase + 2);
            overlay.appendChild(label);
          });

          const items = candidates.map((el, idx) => {
            const id = String(idx + 1);
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute("role");
            const placeholder =
              (el as HTMLInputElement | HTMLTextAreaElement).placeholder ??
                null;
            const type = tag === "input"
              ? (el as HTMLInputElement).type || "text"
              : null;
            const href = el instanceof HTMLAnchorElement ? el.href : null;

            let value: string | null = null;
            if (
              el instanceof HTMLInputElement ||
              el instanceof HTMLTextAreaElement
            ) {
              value = el.value ?? null;
            } else if (
              el.getAttribute("contenteditable") === "" ||
              el.getAttribute("contenteditable") === "true"
            ) {
              value = el.textContent ?? "";
            }

            const text = (el.textContent || "").trim();

            return {
              id,
              dataAttr:
                `[data-interactive-run="${runId}"][data-interactive-id="${id}"]`,
              tag,
              type,
              role,
              placeholder: placeholder || null,
              href: href || null,
              value: value ?? null,
              text,
            };
          });

          return { items };
        }, runId);

        // screenshot with overlays
        await page.screenshot({ path: finalPath, fullPage: false });

        // remove overlays
        await page.evaluate(() => {
          const id = "__interactive_overlay_container__";
          const ov = document.getElementById(id);
          if (ov && ov.parentElement) ov.parentElement.removeChild(ov);
        });

        return JSON.stringify(
          {
            savedPath: finalPath,
            runId,
            locatorStrategy: "data-interactive-run + data-interactive-id",
            elements: items,
          },
          null,
          2,
        );
      } catch (err) {
        return `Failed: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  const BrowserElementScreenshotTool = createTool({
    name: "browser_element_screenshot",
    description:
      `Take a screenshot of a specific element (by selector) or viewport in the CURRENT shared browser session.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe(
          "ID of the existing browser session",
        ),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this screenshot.",
        ),
      selector: z
        .string()
        .optional()
        .describe(
          "CSS selector of the element to screenshot. If omitted, captures the viewport.",
        ),
    }),
    execute: async (params, ctx: ToolExecutionContext): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const resolvedScreenshotDir = resolve(
          ctx.workingDirectory,
          screenshotDir,
        );

        await ensureDir(resolvedScreenshotDir);

        // name generation
        const pageUrl = page.url() || "about:blank";
        const finalPath = screenshotPath(
          resolvedScreenshotDir,
          pageUrl,
        );

        if (params.selector) {
          try {
            // avoid long default waits
            await page.waitForSelector(params.selector, {
              state: "visible",
              timeout: 5000,
            });
          } catch (_err) {
            let content = "";
            try {
              content = await page.content();
            } catch (_e) {
              content = "<unable to retrieve page content>";
            }
            return `Failed: selector ${params.selector} not found/visible on page ${page.url()} - pageContentStart:${
              content.slice(0, 200)
            }`;
          }
          const el = await page.$(params.selector);
          if (!el) {
            return `Failed: selector ${params.selector} not found after wait`;
          }
          await el.screenshot({ path: finalPath });
        } else {
          await page.screenshot({ path: finalPath });
        }

        return JSON.stringify(
          { savedPath: finalPath, selector: params.selector ?? null },
          null,
          2,
        );
      } catch (err) {
        return `Failed: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  return {
    BrowserInteractivesScreenshotTool,
    BrowserElementScreenshotTool,
  };
}

function isInteractiveElement(el: HTMLElement): boolean {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "html" || tag === "body") return false;

  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (
    cs.display === "none" || cs.visibility === "hidden" ||
    cs.visibility === "collapse"
  ) return false;
  if (
    ("disabled" in el &&
      (el as HTMLInputElement | HTMLButtonElement).disabled) ||
    el.getAttribute("aria-disabled") === "true"
  ) return false;
  if (parseFloat(cs.opacity || "1") === 0) return false;

  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const topAtCenter = document.elementFromPoint(cx, cy);
  if (
    topAtCenter &&
    getComputedStyle(topAtCenter).pointerEvents === "none"
  ) return false;

  const interactiveTags = new Set([
    "button",
    "input",
    "select",
    "textarea",
    "a",
    "label",
    "details",
    "summary",
    "option",
    "optgroup",
  ]);
  if (interactiveTags.has(tag)) return true;

  const attrHints = [
    "onclick",
    "onmousedown",
    "onmouseup",
    "onkeydown",
    "onkeyup",
    "tabindex",
  ];
  if (attrHints.some((a) => el.hasAttribute(a))) return true;

  const role = (el.getAttribute("role") || "").toLowerCase();
  const interactiveRoles = new Set([
    "button",
    "link",
    "menuitem",
    "option",
    "radio",
    "checkbox",
    "tab",
    "textbox",
    "combobox",
    "slider",
    "spinbutton",
    "search",
    "searchbox",
    "listbox",
  ]);
  if (role && interactiveRoles.has(role)) return true;

  if (
    r.width >= 10 && r.width <= 50 && r.height >= 10 && r.height <= 50
  ) {
    const iconAttrs = [
      "class",
      "role",
      "onclick",
      "data-action",
      "aria-label",
    ];
    if (iconAttrs.some((a) => el.hasAttribute(a))) return true;
  }

  if (cs.cursor === "pointer") return true;

  try {
    const over = new MouseEvent("mouseover", {
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(over);
    const after = getComputedStyle(el);
    const pointerOnHover = after.cursor === "pointer";
    const out = new MouseEvent("mouseout", {
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(out);
    if (pointerOnHover) return true;
  } catch (_e) {
    // ignore errors during hover heuristic
  }

  return false;
}

function intersectsViewport(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const vw = Math.max(
    document.documentElement.clientWidth || 0,
    globalThis.innerWidth || 0,
  );
  const vh = Math.max(
    document.documentElement.clientHeight || 0,
    globalThis.innerHeight || 0,
  );
  return !(r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh);
}

function screenshotPath(
  parentDir: string,
  pageUrl: string,
): string {
  let baseFromUrl = "page";
  try {
    const u = new URL(pageUrl);
    baseFromUrl = sanitizeName(`${u.hostname}${u.pathname || ""}`) ||
      "page";
  } catch {
    // Default to "page"
  }
  const autoFileName = `${baseFromUrl}_${nowStamp()}.png`;

  const finalPath = `${parentDir}/${autoFileName}`;
  return finalPath;
}
