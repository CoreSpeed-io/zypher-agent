import "jsr:@std/dotenv/load";
import { AccessWebsiteInBrowserTool, ClickWebsiteElementInBrowserTool } from "../src/tools/BrowserUseTools.ts";

async function main() {

  console.log(await AccessWebsiteInBrowserTool.execute(
    {
      url: "http://www.pietromurano.org/", explanation: ""
    }
  ))
  console.log("========================== clicked ==========================")
  console.log(
    await ClickWebsiteElementInBrowserTool.execute(
      {
        htmlTag: "a", tagText: "Publications", explanation: ""
      }
    )
  )
}

main()