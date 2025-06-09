import { join } from "@std/path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import "jsr:@std/dotenv/load";
import { YouTubeVideoAccessTool } from "./YoutubeVideoAccessTool.ts";
const execAsync = promisify(exec);
import { google, youtube_v3 } from "npm:googleapis@latest";

async function main() {
  // const resp = await YouTubeVideoAccessTool.execute({videoId : "NVOMxeAt_-4", explanation: ""})
  const apiKey = Deno.env.get("GOOGLE_CLOUD_API_KEY");
  if (!apiKey) {
    return "Missing YOUTUBE_API_KEY environment variable.";
  }
  const youtube = google.youtube({
    version: "v3",
    auth: apiKey,
  }) as youtube_v3.Youtube;
  const data = await youtube.videos.list({
    id: ["NVOMxeAt_-4"],
    part: ["snippet,contentDetails,statistics"],
  });
}

main();
