import { join } from "@std/path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import "jsr:@std/dotenv/load";
import { YouTubeVideoAccessTool } from "./YoutubeVideoAccessTool.ts";
const execAsync = promisify(exec);
import { google, youtube_v3 } from "npm:googleapis@latest";
import { WebsiteAccessTool } from "./WebsiteAccessTool.ts";

async function main() {
  const resp = await WebsiteAccessTool.execute({url : "https://en.wikipedia.org/wiki/Alcoholics_Anonymous", explanation: ""})
  console.log(resp)
}

main();
