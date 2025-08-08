import "jsr:@std/dotenv/load";
import { WebsiteInfoSearchTool } from "../src/tools/BrowserUseTool/WebsiteInfoSearchTool.ts";
import { WebsiteSurfTool } from "../src/tools/BrowserUseTool/WebsiteSurfTool.ts";
import { AskFileUrlQuestionTool } from "../src/tools/AskFileUrlQuestionTool.ts";
import { WebsiteAccessTool } from "../src/tools/WebsiteAccessTool.ts";

async function main() {
// Let me check the Quora discussions which might have insights about Nature's publication volume.{"url": "https://www.quora.com/What-does-it-take-to-publish-a-scientific-article-in-Nature", "targetInfo": "
  // console.log(await WebsiteInfoSearchTool.execute(
  //   {url: "https://quirkytravelguy.com/ben-jerrys-flavor-graveyard-ice-cream-vermont-headquarters/", targetInfo: "information about the oldest flavor in Ben & Jerry's graveyard, photos of headstones, and details about which flavor is the oldest"} ) )
  
  console.log(
    // await AskFileUrlQuestionTool.execute(
    //   {
    //     "fileUrl": "https://arxiv.org/pdf/2207.01510",
    //     "question": "What is the submission date of this paper to arXiv? Does it contain a figure with three axes where each axis has label words at both ends? If so, what are those six words?", "explanation": "Examining the AI regulation paper to check submission date and identify the figure with three axes and their label words."
    //   }
    // )

    // await WebsiteSurfTool.execute(
    //   {
    //     "fileUrl": "https://arxiv.org/pdf/2207.01510",
    //     "question": "What is the submission date of this paper to arXiv? Does it contain a figure with three axes where each axis has label words at both ends? If so, what are those six words?", "explanation": "Examining the AI regulation paper to check submission date and identify the figure with three axes and their label words."
    //   }
    // )

    await WebsiteSurfTool.execute(
      {
        "target": "ABC",
        "url": "https://nas.er.usgs.gov/queries/FactSheet.aspx?speciesID=324",
        "explanation": ""
      }
    )
  )

}

main()