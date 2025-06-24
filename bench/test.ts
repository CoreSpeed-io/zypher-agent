import "jsr:@std/dotenv/load";
import { AskImageQuestionTool } from "../src/tools/AskImageQuestionTool.ts";

async function main() {
console.log(await AskImageQuestionTool.execute(
  {
    imagePath: "/home/ubuntu/Workspace/zypher-agent/bench/GAIA/2023/validation/df6561b2-7ee5-4540-baab-5095f742716a.png",
    mimeType: "image/jpeg",
    question: "how many red number is in this image"
  }
))
}

main()