import { z } from "zod";
import { defineTool } from "./index.ts";

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
  execute: async ({ command, isBackground, requireUserApproval }) => {
    try {
      if (requireUserApproval) {
        return `Command proposed: ${command}\nWaiting for user approval...`;
      }

      // Parse the command string into command and args
      const cmdParts = command.trim().split(/\s+/);
      const cmd = cmdParts[0];
      const args = cmdParts.slice(1);

      if (isBackground) {
        // For background processes
        const _process = new Deno.Command(cmd, {
          args: args,
          stdin: "null",
          stdout: "null",
          stderr: "null",
        }).spawn();

        // We don't await the process in background mode
        return `Started background command: ${command}`;
      }

      // For foreground processes, wait for completion
      const process = new Deno.Command(cmd, {
        args: args,
        stdout: "piped",
        stderr: "piped",
      });

      const { stdout, stderr } = await process.output();
      const textDecoder = new TextDecoder();
      const stdoutText = textDecoder.decode(stdout);
      const stderrText = textDecoder.decode(stderr);

      if (stderrText) {
        return `Command executed with warnings:\n${stderrText}\nOutput:\n${stdoutText}`;
      }
      return `Command executed successfully:\n${stdoutText}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error executing command: ${error.message}`;
      }
      return "Error executing command: Unknown error";
    }
  },
});
