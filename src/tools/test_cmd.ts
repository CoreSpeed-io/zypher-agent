import { join } from "@std/path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import "jsr:@std/dotenv/load";
import { YouTubeVideoAccessTool } from "./YoutubeVideoAccessTool.ts";
const execAsync = promisify(exec);
import { google, youtube_v3 } from "npm:googleapis@latest";

async function main() {
  const resp = await YouTubeVideoAccessTool.execute({videoId : "NVOMxeAt_-4", explanation: ""})
  console.log(resp)
}

main();
