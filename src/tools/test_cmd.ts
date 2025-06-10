import "jsr:@std/dotenv/load";

import { AudioToTextTool } from "./AudioToTextTool.ts";

async function main() {
  const resp = await AudioToTextTool.execute({file_path: "/home/ubuntu/Workspace/zypher-agent/bench/GAIA/2023/validation/1f975693-876d-457b-a649-393859e79bf3.mp3", explanation: ""})
  console.log(resp)
}

main();
