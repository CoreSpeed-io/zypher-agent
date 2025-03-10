import { ZypherAgent } from '../src/ZypherAgent';
import {
  ReadFileTool,
  ListDirTool,
  EditFileTool,
  RunTerminalCmdTool,
  GrepSearchTool,
  FileSearchTool,
  DeleteFileTool,
} from '../src/tools';
import { Command } from 'commander';
import dotenv from 'dotenv';
import readline from 'readline';
import { stdin as input, stdout as output } from 'process';

const program = new Command();

program
  .name('zypher')
  .description('AI-powered coding assistant')
  .version('0.1.0')
  .option('-w, --workspace <path>', 'Set working directory for the agent')
  .parse(process.argv);

const options = program.opts();

const rl = readline.createInterface({ input, output });

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  dotenv.config();

  try {
    // Handle workspace option
    if (options.workspace) {
      try {
        process.chdir(options.workspace);
        console.log(`🚀 Changed working directory to: ${process.cwd()}`);
      } catch (error) {
        throw new Error(
          `Failed to change to workspace directory: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // Initialize the agent
    const agent = new ZypherAgent();

    // Register all available tools
    agent.registerTool(ReadFileTool);
    agent.registerTool(ListDirTool);
    agent.registerTool(EditFileTool);
    agent.registerTool(RunTerminalCmdTool);
    agent.registerTool(GrepSearchTool);
    agent.registerTool(FileSearchTool);
    agent.registerTool(DeleteFileTool);

    console.log('🔧 Registered tools:', Array.from(agent.tools.keys()).join(', '));

    // Initialize the agent
    await agent.init();

    console.log('\n🤖 Welcome to Zypher Agent CLI!\n');
    console.log('Type your task or command below. Use "exit" or Ctrl+C to quit.\n');

    while (true) {
      const task = await prompt('🔧 Enter your task: ');

      if (task.toLowerCase() === 'exit') {
        console.log('\nGoodbye! 👋\n');
        break;
      }

      if (task.trim()) {
        console.log('\n🚀 Starting task execution...\n');
        try {
          await agent.runTaskLoop(task);
          console.log('\n✅ Task completed.\n');
        } catch (error) {
          console.error('\n❌ Error:', error instanceof Error ? error.message : error);
          console.log('\nReady for next task.\n');
        }
      }
    }
  } catch (error) {
    console.error('Fatal Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nGoodbye! 👋\n');
  process.exit(0);
});

// Run the CLI
main();
