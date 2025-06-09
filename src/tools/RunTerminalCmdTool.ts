import { z } from "zod";
import { defineTool } from "./mod.ts";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { join } from "@std/path";
const PYTHON_VENV_PATH = Deno.env.get("PYTHON_VENV_PATH")!;
const VENV_ACTIVATE_COMMAND = "source " + join(PYTHON_VENV_PATH, "bin", "activate")
const execAsync = promisify(exec);

export const RunTerminalCmdTool = defineTool({
  name: "run_terminal_cmd",
  description:
    "PROPOSE a command to run on behalf of the user.\nIf you have this tool, note that you DO have the ability to run commands directly on the USER's system.\nNote that the user will have to approve the command before it is executed.\nThe user may reject it if it is not to their liking, or may modify the command before approving it.  If they do change it, take those changes into account.\nThe actual command will NOT execute until the user approves it. The user may not approve it immediately. Do NOT assume the command has started running.\nIf the step is WAITING for user approval, it has NOT started running.",
  parameters: z.object({
    command: z.string().describe("The terminal command to execute"),
    isBackground: z
      .boolean()
      .describe("Whether the command should run in background"),
    requireUserApproval: z
      .boolean()
      .describe("Whether user must approve before execution"),
    explanation: z
      .string()
      .optional()
      .describe("One sentence explanation for tool usage"),
  }),
  execute: async ({ command, isBackground }) => {
    command = VENV_ACTIVATE_COMMAND + " && " + command
    try {
      if (isBackground) {
        // For background processes, use spawn
        const child = spawn(command, [], {
          shell: "/usr/bin/bash",
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        return `Started background command: ${command}`;
      }

      const { stdout, stderr } = await execAsync(command, { shell: "/usr/bin/bash" });
      if (stderr) {
        return `Command executed with warnings:\n${stderr}\nOutput:\n${stdout}`;
      }
      return `Command executed successfully:\n${stdout}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error executing command: ${error.message}`;
      }
      return "Error executing command: Unknown error";
    }
  },
});

