import "jsr:@std/dotenv/load";
import { WebsiteInfoSearchTool } from "../src/tools/BrowserUseTool/WebsiteInfoSearchTool.ts";

async function main() {
// Let me check the Quora discussions which might have insights about Nature's publication volume.{"url": "https://www.quora.com/What-does-it-take-to-publish-a-scientific-article-in-Nature", "targetInfo": "
  console.log(Deno.env.get("BROWSERUSEIO_KEY"))
  console.log(await WebsiteInfoSearchTool.execute(
    {url: "https://quirkytravelguy.com/ben-jerrys-flavor-graveyard-ice-cream-vermont-headquarters/", targetInfo: "information about the oldest flavor in Ben & Jerry's graveyard, photos of headstones, and details about which flavor is the oldest"} ) )
}

main()