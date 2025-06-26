import "jsr:@std/dotenv/load";
import { AccessWebsiteInBrowserTool } from "../src/tools/BrowserUseTools.ts";

async function main() {

  console.log(await AccessWebsiteInBrowserTool.execute(
    {
      url: "https://www.base-search.net/", explanation: ""
    }
  ))
  // console.log("========================== clicked ==========================")
  // console.log(
  //   await ClickWebsiteElementInBrowserTool.execute(
  //     {
  //       htmlTag: "a", tagText: "Publications", explanation: ""
  //     }
  //   )
  // )
}

main()