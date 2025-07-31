// WebsiteSurfTool.ts
import { z } from "zod";
import { defineTool } from "../mod.ts";
import { BrowserUseTask } from "./BrowserUseTask.ts";

/**
 * website_surf
 * ------------
 * Drive a headless browser agent (Browser‑Use) with natural‑language instructions.
 * Useful when you need to gather information from a live website, click through UI
 * flows, or extract page content that isn’t available via an API.
 */
export const WebsiteSurfTool = defineTool({
  name: "website_surf",
  description:
    "Navigate a live website with a headless browser to locate and return specific information.",
  parameters: z.object({
    /** Free‑form prompt for the browser agent (e.g. “Open example.com and copy the H1”). */
    target: z.string().describe(
      "Natural‑language description of the exact information you need (e.g. ‘current CEO’).",
    ),
    url: z.string().url().describe(
      "The initial URL to load before searching for the target information.",
    ),
    /** One‑sentence rationale—kept for chain‑of‑thought & auditing like FileSearchTool. */
    explanation: z.string().describe(
      "One‑sentence explanation of why this tool is being invoked and how it advances the overall goal.",
    ),
    /** Optional polling interval override; default is 5 s. */
    pollIntervalMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Polling interval in milliseconds while waiting for task completion (optional).",
      ),
  }),

  /** Execute the browser task and stream back the raw output. */
  execute: async ({ target, url, explanation, pollIntervalMs }) => {
    const browserTask = new BrowserUseTask();

    //   🆕  Richer, self‑contained instructions for the agent
    const instructions = `
Begin at ${url}.
Goal: Locate **only** the information that answers: “${target}”.
Guidelines:
  • Follow links within the site as needed; avoid external domains unless clearly required.
  • Ignore advertisements, cookie banners, and sign‑up pop‑ups.
  • Stop once the answer is found or after visiting 10 pages—whichever comes first.
Output:
  • If found, return the relevant text (≤ 500 characters) and the page URL.
  • If the site requires login, paywall, or the answer is not located, return “NOT_FOUND”.
(Reason for invocation: ${explanation})
`.trim();

    try {
      const output = await browserTask.runTask(
        instructions,
        pollIntervalMs ?? 5000,
      );

      return output || "Task finished but produced no output.";
    } catch (error) {
      if (error instanceof Error) {
        return `BrowserUseTask error: ${error.message}`;
      }
      return "BrowserUseTask error: Unknown failure";
    }
  },
});
