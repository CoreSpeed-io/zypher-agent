import { z } from "zod";
import { defineTool } from "./mod.ts";
import { formatError } from "../error.ts";

/**
 * Query Wikipedia's summary API and return a short description of the topic.
 *
 * @param query - The search term to look up
 * @returns A formatted summary or error message
 */
async function fetchWikipediaSummary(query: string): Promise<string> {
    const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;

    try {
        const res = await fetch(endpoint);

        if (!res.ok) {
            if (res.status === 404) {
                return `Wikipedia does not have a page for "${query}". Please try a different term.`;
            }
            throw new Error(`Wikipedia API returned status ${res.status}`);
        }

        const data = await res.json();

        if (data.extract) {
            return `**${data.title}**\n\n${data.extract}`;
        } else {
            return `No summary available for "${query}".`;
        }
    } catch (error) {
        return `Something went wrong while searching Wikipedia. ${formatError(error)}`;
    }
}

export const SearchWikipediaTool = defineTool({
    name: "search_wikipedia",
    description:
        "Search Wikipedia for a given topic and return a short summary of the corresponding article.\n\n" +
        "Features:\n" +
        "- Queries the English Wikipedia API\n" +
        "- Returns concise and readable summaries\n\n" +
        "Best Practices:\n" +
        "- Use accurate and complete names or terms (e.g., 'Alan Turing', 'Quantum mechanics')\n" +
        "- Avoid ambiguous or too short queries\n",

    parameters: z.object({
        query: z
            .string()
            .min(2, "Your query is too short. Please provide a more specific term.")
            .max(256, "Your query is too long. Please shorten it to under 256 characters.")
            .describe("The topic to search for in Wikipedia"),
    }),

    execute: async ({ query }): Promise<string> => {
        return await fetchWikipediaSummary(query);
    },
});
