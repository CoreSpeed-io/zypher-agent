import { z } from "zod";
import { createTool, type Tool, type ToolResult } from "../mod.ts";

import {
  closeSession,
  listSessions,
  openSession,
} from "./BrowserSessionManager.ts";
/**
 * Create a browser session management tools to open and close browser sessions.
 *
 * @returns An object containing the configured browser session management tools
 */

export function createBrowserSessionTools(): {
  BrowserOpenSessionTool: Tool<{
    sessionId?: string;
    explanation: string;
    persistent?: boolean;
    userDataDir?: string;
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
  }>;
  BrowserCloseSessionTool: Tool<{
    sessionId: string;
    explanation: string;
  }>;
} {
  const BrowserOpenSessionTool = createTool({
    name: "browser_open_session",
    description:
      "Creates a new session or reuses an existing one, returning a sessionId to pass into other browser tools.",
    schema: z.object({
      sessionId: z
        .string()
        .optional()
        .describe(
          "Optional fixed ID. If omitted, a new ID will be generated.",
        ),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of the purpose of this session.",
        ),
      persistent: z
        .boolean()
        .default(false)
        .optional()
        .describe(
          "Whether to use a persistent browser context.",
        ),
      userDataDir: z
        .string()
        .optional()
        .describe(
          "Directory for persistent context (when persistent=true).",
        ),
      viewport: z.object({
        width: z
          .number()
          .int()
          .positive()
          .default(1920),
        height: z
          .number()
          .int()
          .positive()
          .default(1080),
      })
        .optional()
        .describe(
          "Viewport size for the browser context. {width, height}",
        ),
      deviceScaleFactor: z
        .number()
        .positive()
        .optional()
        .describe(
          "Device scale factor for the browser context.",
        ),
    }),

    execute: async (params): Promise<ToolResult> => {
      const { sessionId, page } = await openSession(params);
      return JSON.stringify(
        {
          sessionId,
          url: page.url(),
          sessions: listSessions(),
        },
      );
    },
  });

  const BrowserCloseSessionTool = createTool({
    name: "browser_close_session",
    description: "Close a browser session.",
    schema: z.object({
      sessionId: z
        .string()
        .describe("The ID of the session to close"),
      explanation: z
        .string()
        .describe(
          "One sentence explanation of why this session is being closed.",
        ),
    }),
    execute: async (params): Promise<ToolResult> => {
      await closeSession(params.sessionId);
      return `closed: ${params.sessionId}`;
    },
  });
  return {
    BrowserOpenSessionTool,
    BrowserCloseSessionTool,
  };
}
