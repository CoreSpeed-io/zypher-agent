// import { z } from "zod";
// import { defineTool } from "./mod.ts";
// import { chromium, Page } from 'playwright-core';
// import { DOMParser } from "jsr:@b-fuze/deno-dom";

// const browser = await chromium.connect(
//   `wss://production-sfo.browserless.io/chromium/playwright?token=${Deno.env.get("BROWSERLESSIO_TOKEN")}`,
// );

// const context = await browser.newContext({
//   userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
//               'AppleWebKit/537.36 (KHTML, like Gecko) ' +
//               'Chrome/103.0.0.0 Safari/537.36',
//   extraHTTPHeaders: {
//     // You can add more headers here as key-value pairs
//     // e.g. 'Accept-Language': 'en-US,en;q=0.9'
//   }
// })

// let currentPage: Page | null = null;

// function cleanHtml(raw: string): string {
//   // Create a DOM document; DOMParser scripts/styles won't execute :contentReference[oaicite:1]{index=1}
//   const parser = new DOMParser();
//   const doc = parser.parseFromString(raw, "text/html");

//   // Remove <script> and <style> tags
//   doc.querySelectorAll("script, style").forEach(el => el.remove());

//   // Remove inline event handlers (e.g., onclick, onload)
//   for (const el of Array.from(doc.querySelectorAll("*"))) {
//     for (const attr of Array.from(el.attributes)) {
//       if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
//       // Strip inline CSS styling
//       if (attr.name === "style") el.removeAttribute("style");
//     }
//   }
//   return doc.documentElement?.outerHTML ?? "";
// }

// export const AccessWebsiteInBrowserTool = defineTool({
//   name: "access_website_in_browser",
//   description:
//     "Open the website url in Web Browser and returns its DOM as a string.",
//   parameters: z.object({
//     url: z.string().url().describe("Absolute URL of the page to fetch"),
//     explanation: z
//       .string()
//       .describe(
//         "One-sentence rationale for using this tool and how it furthers the goal.",
//       ),
//   }),
//   execute: async ({ url }) => {
//     try {
//       currentPage = await context.newPage();
//       await currentPage.goto(url, {
//         waitUntil: "networkidle",
//         timeout: 30_000,
//       });
//       const dom = await currentPage.content();
//       return cleanHtml(dom) || "⚠️ Empty DOM string returned.";
//     } catch (error) {
//       if (error instanceof Error) {
//         return `❌ Error accessing website: ${error.message}`;
//       }
//       return "❌ Error accessing website: Unknown error.";
//     }
//   },
// });



// export const ClickWebsiteElementInBrowserTool = defineTool({
//   name: "click_element_in_browser",
//   description:
//     "Click an element on the current page (opened with access_website_in_browser) " + 
//     "and return the cleaned DOM after the click.",
//   parameters: z.object({
//     htmlTag: z.string().describe(
//       "HTML tag of the element to click (e.g. 'button', 'a', 'div').",
//     ),
//     tagText: z.string().describe(
//       "Exact visible text contained in that tag, used to locate the element.",
//     ),
//     explanation: z
//       .string()
//       .describe(
//         "One-sentence rationale for using this tool and how it furthers the goal.",
//       ),
//   }),
//   execute: async ({ htmlTag, tagText }) => {
//     if (!currentPage) {
//       return "❌ No page is open. Call access_website_in_browser first.";
//     }

//     try {
//       // Build a CSS selector that finds a tag containing the required text
//       const selector = `${htmlTag}:has-text("${tagText}")`; // Playwright’s :has-text() pseudo-class :contentReference[oaicite:1]{index=1}

//       // Make sure the element is actually on-screen and interactable
//       await currentPage.waitForSelector(selector, {
//         state: "visible",            // wait until visible to avoid flakiness :contentReference[oaicite:2]{index=2}
//         timeout: 10_000,
//       });

//       // Click the first matching element
//       await currentPage.locator(selector).first().click();

//       // Wait for network to go idle so any navigation/XHR finishes
//       await currentPage.waitForLoadState("networkidle");      // wait post-click :contentReference[oaicite:3]{index=3}
//       await page.waitForTimeout(3000);
//       // Return the sanitised HTML to the caller
//       const domAfter = await currentPage.content();
//       return cleanHtml(domAfter) || "⚠️ Empty DOM string returned after click.";
//     } catch (error) {
//       if (error instanceof Error) {
//         return `❌ Error clicking element: ${error.message}`;
//       }
//       return "❌ Error clicking element: Unknown error.";
//     }
//   },
// });

// export const FillInputElementInBrowserTool = defineTool({
//   name: "fill_input_element_in_browser",
//   description:
//     "Fill an input‐type element on the current page (opened via access_website_in_browser) " + 
//     "and return the cleaned DOM after the value is entered.",
//   parameters: z.object({
//     htmlTag: z
//       .string()
//       .describe("HTML tag for the control you want to fill (e.g. 'input', 'textarea')."),
//     attributeName: z
//       .string()
//       .describe(
//         "The attribute used to locate the element (e.g. 'name', 'placeholder', 'id', 'aria-label').",
//       ),
//     attributeValue: z
//       .string()
//       .describe(
//         "The exact value of that attribute (case-sensitive) that identifies the element.",
//       ),
//     text: z.string().describe("The text you want to type into the element."),
//     explanation: z
//       .string()
//       .describe("One-sentence rationale for using this tool and how it furthers the goal."),
//   }),
//   execute: async ({ htmlTag, attributeName, attributeValue, text }) => {
//     if (!currentPage) {
//       return "❌ No page is open. Call access_website_in_browser first.";
//     }

//     try {
//       // Build a robust, attribute-based selector.
//       const selector = `${htmlTag}[${attributeName}="${attributeValue}"]`;

//       // Wait until the control is attached & visible.
//       await currentPage.waitForSelector(selector, { state: "visible", timeout: 10_000 }); // ensures interactability :contentReference[oaicite:0]{index=0}

//       // Fill the element. Playwright automatically focuses and fires input events. :contentReference[oaicite:1]{index=1}
//       await currentPage.locator(selector).first().fill(text);

//       // Give the page a moment to react (validation, Ajax, etc.).
//       await currentPage.waitForLoadState("networkidle"); // same post-interaction wait pattern :contentReference[oaicite:2]{index=2}

//       // Return a sanitised DOM snapshot.
//       const domAfter = await currentPage.content();
//       return cleanHtml(domAfter) || "⚠️ Empty DOM string returned after filling.";
//     } catch (error) {
//       if (error instanceof Error) {
//         return `❌ Error filling element: ${error.message}`;
//       }
//       return "❌ Error filling element: Unknown error.";
//     }
//   },
// });