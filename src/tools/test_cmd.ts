import { join } from "@std/path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import "jsr:@std/dotenv/load";
const execAsync = promisify(exec);

async function main() {
  const PYTHON_VENV_PATH = Deno.env.get("PYTHON_VENV_PATH")!;
  const VENV_ACTIVATE_COMMAND = "source " + join(PYTHON_VENV_PATH, "bin", "activate")
  console.log(VENV_ACTIVATE_COMMAND)
  const command = VENV_ACTIVATE_COMMAND + " && " + "python3 /home/ubuntu/Workspace/zypher-agent/bench/workspace/e1fc63a2-da7a-432f-be78-7c4a95598703/calculation.py"
  // const command = "python3 /home/ubuntu/Workspace/zypher-agent/bench/workspace/e1fc63a2-da7a-432f-be78-7c4a95598703/calculation.py"
  const { stdout, stderr } =  await execAsync(command, { shell: '/usr/bin/bash' });
  console.log(`${stdout}`)
}

main()
