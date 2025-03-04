import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { defineTool } from './index';

const execAsync = promisify(exec);

export const RunTerminalCmdTool = defineTool({
  name: 'run_terminal_cmd',
  description: 'PROPOSE a command to run on behalf of the user.',
  parameters: z.object({
    command: z.string().describe('The terminal command to execute'),
    isBackground: z.boolean().describe('Whether the command should run in background'),
    requireUserApproval: z.boolean().describe('Whether user must approve before execution'),
    explanation: z.string().optional().describe('One sentence explanation for tool usage'),
  }),
  execute: async ({ command, isBackground, requireUserApproval }) => {
    try {
      if (requireUserApproval) {
        return `Command proposed: ${command}\nWaiting for user approval...`;
      }

      if (isBackground) {
        // For background processes, use spawn
        const child = spawn(command, [], { shell: true, detached: true, stdio: 'ignore' });
        child.unref();
        return `Started background command: ${command}`;
      }

      const { stdout, stderr } = await execAsync(command);
      if (stderr) {
        return `Command executed with warnings:\n${stderr}\nOutput:\n${stdout}`;
      }
      return `Command executed successfully:\n${stdout}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error executing command: ${error.message}`;
      }
      return 'Error executing command: Unknown error';
    }
  },
}); 