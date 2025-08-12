// YouTubeVideoTool.ts
import { z } from "zod";
import { defineTool } from "./mod.ts";

/**
 * Tool: youtube_video
 * -------------------
 * Grabs video metadata + top-level comments from YouTube
 * and returns a tidy, newline-delimited string that drops
 * straight into an LLM prompt.
 *
 * NOTE: This version uses plain HTTPS requests (fetch) against the
 * YouTube Data v3 REST endpoints instead of the googleapis SDK.
 */
export const YouTubeVideoAccessTool = defineTool({
  name: "youtube_video",
  description:
    "Fetch a YouTube video's metadata and up to N top-level comments, formatted for easy LLM consumption. Do not over rely on the comments, as they are not guaranteed.",
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
      return "Missing GOOGLE_CLOUD_API_KEY environment variable.";
    }

    const endpoint = "https://www.googleapis.com/youtube/v3";

    // Helper to call the YouTube Data API v3
    const ytFetch = async <T>(
      path: string,
      params: Record<string, string | number | undefined>,
    ): Promise<T> => {
      const query = new URLSearchParams({
        key: apiKey,
        ...Object.entries(params).reduce(
          (acc, [k, v]) => (v === undefined ? acc : { ...acc, [k]: String(v) }),
          {},
        ),
      });
      const res = await fetch(`${endpoint}/${path}?${query.toString()}`);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `YouTube API error (${res.status}): ${errText.slice(0, 200)}`,
        );
      }
      return res.json() as Promise<T>;
    };

    try {
      /* -------- 1. Metadata -------- */
      type VideosListResp = {
        items: Array<{
          snippet: {
            title: string;
            channelTitle: string;
            publishedAt: string;
            description: string;
          };
          statistics?: {
            viewCount?: string;
            likeCount?: string;
          };
        }>;
      };

      const videoList = await ytFetch<VideosListResp>("videos", {
        id: videoId,
        part: "snippet,contentDetails,statistics",
      });

      if (!videoList.items?.length) {
        return `Video '${videoId}' not found or inaccessible.`;
      }

      const { snippet, statistics } = videoList.items[0];

      /* -------- 2. Comments -------- */
      const comments: string[] = [];
      let pageToken: string | undefined;

      type CommentThreadsResp = {
        nextPageToken?: string;
        items: Array<{
          snippet: {
            topLevelComment: {
              snippet: {
                authorDisplayName: string;
                likeCount: number;
                publishedAt: string;
                textDisplay: string;
              };
            };
          };
        }>;
      };

      while (comments.length < maxComments) {
        const data = await ytFetch<CommentThreadsResp>("commentThreads", {
          videoId,
          part: "snippet",
          maxResults: 100,
          textFormat: "plainText",
          pageToken,
        });

        for (const thread of data.items ?? []) {
          const c = thread.snippet?.topLevelComment?.snippet;
          if (!c) continue;
          comments.push(
            `(${c.authorDisplayName}; ${c.likeCount ?? 0} likes; ${c.publishedAt}): ${c.textDisplay.replace(/\s+/g, " ").trim()}`,
          );
          if (comments.length >= maxComments) break;
        }

        if (!data.nextPageToken) break;
        pageToken = data.nextPageToken;
      }

      /* -------- 3. LLM-friendly string -------- */
      const header = [
        `TITLE: ${snippet.title}`,
        `CHANNEL: ${snippet.channelTitle}`,
        `PUBLISHED_AT: ${snippet.publishedAt}`,
        `VIEWS: ${statistics?.viewCount ?? "?"}`,
        `LIKES: ${statistics?.likeCount ?? "?"}`,
        `DESCRIPTION: ${snippet.description.slice(0, 500)}`,
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
