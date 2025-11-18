import { z } from "zod";
import { createTool, type Tool, type ToolResult } from "../mod.ts";
import { getPage } from "./BrowserSessionManager.ts";

/**
 * Create browser wait tools to wait for elements, requests, or responses within a browser session.
 *
 * @returns An object containing the configured browser wait tools
 */

export function createBrowserWaitTools(): {
  BrowserWaitTool: Tool<{
    sessionId: string;
    explanation: string;
    selector?: string;
    state?: "attached" | "detached" | "visible" | "hidden";
    timeoutMs?: number;
    jsExpression?: string;
  }>;
  BrowserWaitForRequestTool: Tool<{
    sessionId: string;
    explanation: string;
    urlSubstring?: string;
    urlRegex?: string;
    method?: string;
    timeoutMs?: number;
  }>;
  BrowserWaitForResponseTool: Tool<{
    sessionId: string;
    explanation: string;
    urlSubstring?: string;
    urlRegex?: string;
    status?: number;
    timeoutMs?: number;
  }>;
} {
  const BrowserWaitTool = createTool({
    name: "browser_wait",
    description:
      `Wait for a selector or a JS expression to become truthy in the CURRENT shared browser session`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this wait.",
        ),
      selector: z
        .string()
        .optional()
        .describe("CSS selector to wait for"),
      state: z.union([
        z.literal("attached"),
        z.literal("detached"),
        z.literal("visible"),
        z.literal("hidden"),
      ])
        .optional()
        .default("visible")
        .describe(
          "State to wait for (only when selector is provided)",
        ),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum wait time in milliseconds"),
      jsExpression: z
        .string()
        .optional()
        .describe(
          "JavaScript expression to wait for (alternative to selector)",
        ),
    }),
    execute: async (params): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);

        if (params.selector) {
          await page.waitForSelector(params.selector, {
            state: params.state,
            timeout: params.timeoutMs,
          });
          return JSON.stringify(
            {
              ok: true,
              selector: params.selector,
              state: params.state,
              url: page.url(),
            },
            null,
            2,
          );
        }

        if (params.jsExpression) {
          // page.waitForFunction accepts a string expression
          await page.waitForFunction(params.jsExpression, {
            timeout: params.timeoutMs,
          });
          return JSON.stringify(
            {
              ok: true,
              jsExpression: params.jsExpression,
              url: page.url(),
            },
          );
        }

        return `Please provide selector or jsExpression`;
      } catch (err) {
        return `Failed: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  const BrowserWaitForRequestTool = createTool({
    name: "browser_wait_for_request",
    description:
      `Wait for a network request emitted by the page that matches provided filters (url substring, regex, method).`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this wait.",
        ),
      urlSubstring: z
        .string()
        .optional()
        .describe("Substring to match in the request URL"),
      urlRegex: z
        .string()
        .optional()
        .describe("Regex pattern to match in the request URL"),
      method: z
        .string()
        .optional()
        .describe("HTTP method to match (e.g., GET, POST)"),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum wait time in milliseconds"),
    }),
    execute: async (params): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const re = params.urlRegex ? new RegExp(params.urlRegex) : null;
        const req = await page.waitForRequest((r) => {
          if (
            params.method &&
            r.method().toUpperCase() !== params.method.toUpperCase()
          ) {
            return false;
          }
          const u = r.url();
          if (params.urlSubstring && !u.includes(params.urlSubstring)) {
            return false;
          }
          if (re && !re.test(u)) return false;
          return true;
        }, { timeout: params.timeoutMs });

        // Try to gather postData
        let postData: string | null = null;
        try {
          postData = req.postData ? req.postData() : null;
        } catch {
          postData = null;
        }

        return JSON.stringify(
          {
            ok: true,
            url: req.url(),
            method: req.method(),
            headers: req.headers(),
            postData,
          },
        );
      } catch (err) {
        return `Failed to wait for request: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  const BrowserWaitForResponseTool = createTool({
    name: "browser_wait_for_response",
    description:
      `Wait for a network response emitted by the page that matches provided filters (url substring, regex, status).`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this wait.",
        ),
      urlSubstring: z
        .string()
        .optional()
        .describe("Substring to match in the response URL"),
      urlRegex: z
        .string()
        .optional()
        .describe("Regex pattern to match in the response URL"),
      status: z
        .number()
        .int()
        .optional()
        .describe("HTTP status code to match (e.g., 200, 404)"),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum wait time in milliseconds"),
    }),
    execute: async (params): Promise<ToolResult> => {
      try {
        const page = await getPage(params.sessionId);
        const re = params.urlRegex ? new RegExp(params.urlRegex) : null;
        const resp = await page.waitForResponse((r) => {
          if (
            typeof params.status === "number" && r.status() !== params.status
          ) return false;
          const u = r.url();
          if (params.urlSubstring && !u.includes(params.urlSubstring)) {
            return false;
          }
          if (re && !re.test(u)) return false;
          return true;
        }, { timeout: params.timeoutMs });

        let body: string | null = null;
        try {
          body = await resp.text();
        } catch {
          body = null;
        }

        return JSON.stringify(
          {
            ok: true,
            url: resp.url(),
            status: resp.status(),
            headers: resp.headers(),
            body,
          },
        );
      } catch (err) {
        return `Failed to wait for response: ${(err as Error)?.message ?? err}`;
      }
    },
  });

  return {
    BrowserWaitTool,
    BrowserWaitForRequestTool,
    BrowserWaitForResponseTool,
  };
}
