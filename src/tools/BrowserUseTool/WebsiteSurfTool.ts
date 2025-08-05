// WebsiteSurfTool.ts
import { z } from "zod";
import { defineTool } from "../mod.ts";
import { BrowserUseTask } from "./BrowserUseTask.ts";
import { WebsiteAccessTool } from "../WebsiteAccessTool.ts"
import OpenAI from "@openai/openai";

const client = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});



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
    "Navigate a live website with a browser to locate and return specific information. If an attempt to directly access a link fails, this tool should be used",
  parameters: z.object({
    /** Free‑form prompt for the browser agent (e.g. “Open example.com and copy the H1”). */
    target: z.string().describe(
      "Natural-language description of the exact information you need (e.g. 'current CEO').",
    ),
    url: z.string().url().describe(
      "The initial URL to load before searching for the target information.",
    ),
    /** One‑sentence rationale—kept for chain‑of‑thought & auditing like FileSearchTool. */
    explanation: z.string().describe(
      "One-sentence explanation of why this tool is being invoked and how it advances the overall goal.",
    ),
    /** Optional polling interval override; default is 5s. */
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
Goal: Locate the information that answers: “${target}”.
Guidelines:
  • Ignore advertisements, cookie banners, and sign‑up pop‑ups.
  • Stop once the answer is found or after visiting 10 pages—whichever comes first.
  • Try your best to interact with the website to get the answer(such as keyword searching, scrolling, clicking button to expand half-hidden list, using the search engine provided by the website).
Output:
  • If found, return the relevant text (≤ 500 characters) and the page URL.
  • if you find a file (ONLY PDF FILE) that may be helpful for solving the question, return the download link of that file (especially link of paper).
  • if you find a image that may be helpful for solving the question, return the download link of that image.
  
(Reason for invocation: ${explanation})
`.trim();
    let output = null
    async function fall_back() {
      const site_content = await WebsiteAccessTool.execute({
        url: url,
        explanation: explanation
      }) || ''
      const response = await client.responses.create({
        model: "o3-pro-2025-06-10",
        reasoning: {
          effort: "high"
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: site_content,
              },
              {
                type: "input_text",
                text: `
in content above, Goal: Locate the information that answers: "${target}". 
  • return not found if the goal information not found.
  • if you find a file (pdf, image, xlsx/csv) that may be helpful for solving the question, return the download link of that file (especially link of paper).
`,
              }
            ],
          },
        ],
      });
      return response.output_text
    }
    try {
      output = await browserTask.runTask(
        instructions,
        pollIntervalMs ?? 5000,
      );

      if (!output) {
        return await fall_back()
      }

      return output
    } catch (error) {
      if (error instanceof Error) {
        console.log(`BrowserUseTask error: ${error.message}`)
        
      }
      console.log(`BrowserUseTask error: Unknown failure ${error}`);
      return await fall_back();
    }
  },
});
