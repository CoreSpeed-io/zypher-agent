import "jsr:@std/dotenv/load";
import { AskFileUrlQuestionTool } from "../src/tools/AskFileUrlQuestionTool.ts";

async function main() {

console.log(await AskFileUrlQuestionTool.execute(
  {
    fileUrl: "https://www.bbc.co.uk/writers/documents/doctor-who-s9-ep11-heaven-sent-steven-moffat.pdf",
    question: "In Series 9, Episode 11 of Doctor Who, the Doctor is trapped inside an ever-shifting maze. What is this location called in the official script for the episode? Give the setting exactly as it appears in the first scene heading.",

  }
))
}

main()