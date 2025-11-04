import { z } from "zod";
import { createTool, type Tool, type ToolResult } from "../mod.ts";

import { getPage } from "./BrowserSessionManager.ts";

/**
 * Create browser navigation tools to navigate within a browser session.
 *
 * @returns An object containing the configured browser navigation tools
 */

export function createBrowserNavigationTools(): {
  BrowserNavigateToTool: Tool<{
    sessionId: string;
    explanation: string;
    url: string;
    waitUntil?: "load" | "domcontentloaded" | "networkidle";
    timeoutMs?: number;
  }>;
  BrowserForwardTool: Tool<{
    sessionId: string;
    explanation: string;
    waitUntil?: "load" | "domcontentloaded" | "networkidle";
  }>;
  BrowserBackTool: Tool<{
    sessionId: string;
    explanation: string;
    waitUntil?: "load" | "domcontentloaded" | "networkidle";
  }>;
} {
  const BrowserNavigateToTool = createTool({
    name: "browser_navigate_to",
    description: "Navigate the current shared browser session page to a URL.",
    schema: z.object({
      sessionId: z
        .string()
        .describe(
          "ID of the existing browser session",
        ),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this navigation.",
        ),
      url: z
        .string()
        .url()
        .describe("Target URL to navigate to"),
      waitUntil: z
        .enum(["load", "domcontentloaded", "networkidle"])
        .default(
          "load",
        )
        .optional()
        .describe("Wait until the specified load state"),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Navigation timeout in milliseconds",
        ),
    }),
    execute: async (params): Promise<ToolResult> => {
      const page = await getPage(params.sessionId);
      await page.goto(params.url, {
        waitUntil: params.waitUntil,
        timeout: params.timeoutMs,
      });
      return `navigated to: ${page.url()}`;
    },
  });

  const BrowserForwardTool = createTool({
    name: "browser_forward",
    description:
      "Go forward in the current shared browser session page history.",
    schema: z.object({
      sessionId: z
        .string()
        .describe(
          "ID of the existing browser session",
        ),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this navigation.",
        ),
      waitUntil: z
        .enum(["load", "domcontentloaded", "networkidle"])
        .default(
          "load",
        )
        .optional()
        .describe("Wait until the specified load state"),
    }),
    execute: async (params): Promise<ToolResult> => {
      const page = await getPage(params.sessionId);
      await page.goForward({ waitUntil: params.waitUntil });
      return `forward → ${page.url()}`;
    },
  });

  const BrowserBackTool = createTool({
    name: "browser_back",
    description: `Go back in the current shared browser session page history.`,
    schema: z.object({
      sessionId: z
        .string()
        .describe("ID of the existing browser session"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this navigation.",
        ),
      waitUntil: z
        .enum(["load", "domcontentloaded", "networkidle"])
        .default(
          "load",
        )
        .optional()
        .describe("Wait until the specified load state"),
    }),
    execute: async (params): Promise<ToolResult> => {
      const page = await getPage(params.sessionId);
      await page.goBack({ waitUntil: params.waitUntil });
      return `back ← ${page.url()}`;
    },
  });

  return {
    BrowserNavigateToTool,
    BrowserForwardTool,
    BrowserBackTool,
  };
}
