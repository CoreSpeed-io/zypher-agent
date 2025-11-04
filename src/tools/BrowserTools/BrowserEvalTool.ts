import { z } from "zod";
import { createTool, type Tool } from "../mod.ts";
import { getPage } from "./BrowserSessionManager.ts";

export const BrowserEvalTool: Tool<{
  sessionId: string;
  explanation: string;
  expression: string;
}> = createTool({
  name: "browser_eval",
  description:
    `Evaluate a JavaScript expression in the current page context and return the result.`,
  schema: z.object({
    sessionId: z
      .string()
      .describe("ID of the existing browser session"),
    explanation: z.string()
      .describe(
        "One sentence explanation of the purpose of this evaluation.",
      ),
    expression: z
      .string()
      .describe(
        "JavaScript expression to evaluate in page context",
      ),
  }),
  execute: async ({ sessionId, expression }) => {
    try {
      const page = await getPage(sessionId);
      // Evaluate the provided expression in page context
      const result = await page.evaluate(expression as string);
      return JSON.stringify({ result: result });
    } catch (err) {
      return `Failed to evaluate expression: ${(err as Error)?.message ?? err}`;
    }
  },
});
