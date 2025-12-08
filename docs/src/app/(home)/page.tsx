import Link from 'next/link';
import AnimatedText from '@/components/AnimatedText';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';

const codeExample = `import { AnthropicModelProvider, createZypherAgent } from "@corespeed/zypher";
import { createFileSystemTools } from "@corespeed/zypher/tools";
import { eachValueFrom } from "rxjs-for-await";

const agent = await createZypherAgent({
  modelProvider: new AnthropicModelProvider({
    apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
  }),
  tools: [...createFileSystemTools()],
  mcpServers: ["@modelcontextprotocol/sequentialthinking-server"],
});

// Run task with streaming
const taskEvents = agent.runTask(
  "Implement authentication middleware",
  "claude-sonnet-4-20250514",
);

for await (const event of eachValueFrom(taskEvents)) {
  console.log(event);
}`;

export default function HomePage() {
  const tools = ['Cursor', 'Claude Code', 'Devin', 'DeckSpeed', 'Lovart'];

  return (
    <main className="flex flex-1 flex-col px-4 md:px-6 relative bg-[radial-gradient(circle,_rgba(0,0,0,0.03)_1px,_transparent_1px)] dark:bg-[radial-gradient(circle,_rgba(255,255,255,0.03)_1px,_transparent_1px)] bg-[size:24px_24px]">
      {/* Hero Section */}
      <section className="w-full max-w-[1200px] mx-auto pt-16 md:pt-24 lg:pt-32 pb-20 md:pb-28">
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12 lg:gap-12 items-center">
          {/* Left Column - Text Content */}
          <div className="flex flex-col order-2 lg:order-1">
            {/* Status Badge */}
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 border border-fd-border mb-8 w-fit text-sm font-mono">
              <span className="w-1.5 h-1.5 bg-emerald-500"></span>
              <span className="text-fd-muted-foreground">v0.1.0 Available</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-semibold text-fd-foreground mb-6 tracking-tight leading-[1.2]">
              Build your own
              <br />
              <AnimatedText
                texts={tools}
                className="text-fd-foreground"
                interval={2500}
              />
              <br />
              <span className="text-fd-muted-foreground">with</span>{' '}
              <span className="text-[#F2572B]">Zypher</span>
            </h1>

            <p className="text-lg md:text-xl text-fd-muted-foreground mb-10 leading-relaxed max-w-lg text-balance">
              A few lines of code to create powerful AI agents. Connect any MCP server, choose your LLM provider, and start building.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/docs/quick-start"
                className="group px-5 py-2.5 border border-fd-foreground text-fd-foreground font-medium hover:bg-fd-foreground hover:text-fd-background transition-all text-center inline-flex items-center justify-center gap-2 text-sm min-w-[140px]"
              >
                Read Docs
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link
                href="https://github.com/corespeed-io/zypher-agent"
                target="_blank"
                rel="noopener noreferrer"
                className="group px-5 py-2.5 border border-fd-border text-fd-foreground font-medium text-center text-sm hover:bg-fd-foreground hover:text-fd-background transition-all inline-flex items-center justify-center gap-2 min-w-[140px]"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </Link>
            </div>
          </div>

          {/* Right Column - Code Block */}
          <div className="order-1 lg:order-2">
            <div className="relative [&_figure]:!my-0 [&_figure]:!rounded-none [&_figure]:!border-fd-border [&_pre]:!max-h-[400px]">
              <DynamicCodeBlock
                lang="typescript"
                code={codeExample}
                codeblock={{
                  title: 'main.ts',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full border-t border-fd-border">
        <div className="max-w-[1100px] mx-auto py-20 md:py-28">
          <h2 className="text-2xl md:text-3xl font-semibold text-fd-foreground mb-4 text-center">
            Everything you need to build AI agents
          </h2>
          <p className="text-fd-muted-foreground text-center mb-16 max-w-2xl mx-auto text-balance">
            A minimal yet powerful framework for creating AI agents with full control over tools, providers, and execution flow.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="group p-6 border border-fd-border hover:border-fd-foreground/50 transition-all duration-200">
              <div className="w-10 h-10 border border-fd-border flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-fd-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold mb-2 text-fd-foreground">Interactive CLI</h3>
              <p className="text-fd-muted-foreground text-sm leading-relaxed">
                Fast prototyping with an intuitive command-line interface for building and testing agents.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group p-6 border border-fd-border hover:border-fd-foreground/50 transition-all duration-200">
              <div className="w-10 h-10 border border-fd-border flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-fd-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold mb-2 text-fd-foreground">Tool Calling & MCP</h3>
              <p className="text-fd-muted-foreground text-sm leading-relaxed">
                Built-in tool system with Model Context Protocol support for seamless integrations.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group p-6 border border-fd-border hover:border-fd-foreground/50 transition-all duration-200">
              <div className="w-10 h-10 border border-fd-border flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-fd-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold mb-2 text-fd-foreground">Git Checkpoints</h3>
              <p className="text-fd-muted-foreground text-sm leading-relaxed">
                Track and revert changes with a git-based checkpoint system for reliable development.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="w-full border-t border-fd-border">
        <div className="max-w-[1100px] mx-auto py-20 text-center">
          <p className="text-sm text-fd-muted-foreground mb-6">
            Ready to build your first agent?
          </p>
          <Link
            href="/docs/quick-start"
            className="inline-flex items-center gap-2 text-fd-foreground font-medium hover:text-[#F2572B] transition-colors border-b border-fd-foreground/50 pb-0.5"
          >
            Read the documentation
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </section>
    </main>
  );
}
