// YouTubeVideoTool.ts
import { z } from "zod";
import { defineTool } from "./mod.ts";
import { google, youtube_v3 } from "npm:googleapis@latest";

/**
 * Tool: youtube_video
 * -------------------
 * Grabs video metadata + top-level comments from YouTube
 * and returns a tidy, newline-delimited string that drops
 * straight into an LLM prompt.
 */
export const YouTubeVideoAccessTool = defineTool({
  name: "youtube_video",
  description:
    "Fetch a YouTube video's metadata and up to N top-level comments, formatted for easy LLM consumption.",
  parameters: z.object({
    videoId: z
      .string()
      .describe("The 11-character YouTube video ID (e.g. dQw4w9WgXcQ)"),
    maxComments: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100)
      .describe("How many comments to include (1-500, default 20)")
      .optional(),
    explanation: z
      .string()
      .describe(
        "One-sentence explanation of why this tool is used and how it advances the goal.",
      ),
  }),
  execute: async ({ videoId, maxComments = 20 }) => {
    /* -------- 0. Pre-flight -------- */
    const apiKey = Deno.env.get("GOOGLE_CLOUD_API_KEY");
    if (!apiKey) {
      return "Missing YOUTUBE_API_KEY environment variable.";
    }

    const youtube = google.youtube({
      version: "v3",
      auth: apiKey,
    }) as youtube_v3.Youtube;

    try {
      /* -------- 1. Metadata -------- */
      const {
        data: { items },
      } = await youtube.videos.list({
        id: [videoId],
        part: ["snippet,contentDetails,statistics"],
      });
      console.log("data", items)
      if (!items?.length) {
        return `Video '${videoId}' not found or inaccessible.`;
      }

      const vid = items[0];
      const { snippet, statistics } = vid;

      /* -------- 2. Comments -------- */
      const comments: string[] = [];
      let pageToken: string | undefined;

      while (comments.length < maxComments) {
        const { data } = await youtube.commentThreads.list({
          videoId,
          part: ["snippet"],
          maxResults: 100,
          textFormat: "plainText",
          pageToken,
        });

        for (const thread of data.items ?? []) {
          const c = thread.snippet?.topLevelComment?.snippet;
          if (!c) continue;
          comments.push(
            `(${c.authorDisplayName}; ${c.likeCount ?? 0} likes; ${
              c.publishedAt
            }): ${c.textDisplay.replace(/\s+/g, " ").trim()}`,
          );
          if (comments.length >= maxComments) break;
        }

        if (!data.nextPageToken) break;
        pageToken = data.nextPageToken;
      }

      /* -------- 3. LLM-friendly string -------- */
      const header = [
        `TITLE: ${snippet?.title}`,
        `CHANNEL: ${snippet?.channelTitle}`,
        `PUBLISHED_AT: ${snippet?.publishedAt}`,
        `VIEWS: ${statistics?.viewCount}`,
        `LIKES: ${statistics?.likeCount}`,
        `DESCRIPTION: ${(snippet?.description ?? "").slice(0, 500)}`,
        "----- COMMENTS -----",
      ].join("\n");

      const body = comments.map((c, i) => `#${i + 1} ${c}`).join("\n");

      return `${header}\n${body}`;
    } catch (err) {
      return err instanceof Error
        ? `Error fetching YouTube data: ${err.message}`
        : "Unknown error fetching YouTube data.";
    }
  },
});
