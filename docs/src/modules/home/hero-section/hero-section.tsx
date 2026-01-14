import Link from "next/link";
import { Button } from "@/components/button";
import { ArrowRightIcon } from "@/components/icons/arrow-right";
import { DenoIcon } from "@/components/icons/deno";
import { GithubIcon } from "@/components/icons/github";
import { cn } from "@/lib/cn";
import { CodeBlock } from "./code-block";
import { CopyButton } from "./copy-button";
import { ToolsBlock } from "./tools-block";

const codeExample = `import { createZypherAgent } from "@zypher/agent";
import { createFileSystemTools } from "@zypher/agent/tools";
import { eachValueFrom } from "rxjs-for-await";

const agent = await createZypherAgent({
  model: "claude-sonnet-4-5-20250929", // Or use ModelProvider for advanced options
  tools: [...createFileSystemTools()],
  mcpServers: ["@modelcontextprotocol/sequentialthinking-server"],
});

// Run task with streaming
const taskEvents = agent.runTask("Implement authentication middleware");

for await (const event of eachValueFrom(taskEvents)) {
  console.log(event);
}`;

export function HeroSection() {
  return (
    <section className="mx-auto max-w-[1440px] desktop:border-x desktop:border-outline-med">
      <div className="desktop:px-0 desktop:flex desktop:items-center desktop:max-w-[1196px] overflow-hidden desktop:mx-[122px] tablet:mx-20 mx-6 border-x border-outline-med">
        <div>
          <div className="pt-6 pb-8 tablet:pt-12 border-b">
            <h1
              className={cn(
                "text-4xl tablet:text-5xl font-semibold leading-[130%] tracking-[-0.036em] font-mono text-center",
              )}
            >
              <div className="ml-6 text-center desktop:text-left tablet:ml-12">
                Build your own
              </div>
              <ToolsBlock className="my-6.5" />
              <div className="ml-6 text-center desktop:text-left tablet:ml-12">
                with <span className="text-brand-base">Zypher</span>
              </div>
            </h1>
          </div>

          <div className="px-6 pt-8 pb-12 tablet:pb-[72px] desktop:px-12 border-b desktop:border-none">
            <p className="text-text-base text-sm leading-[140%] font-mono text-pretty desktop:text-lg">
              A few lines of code to create powerful AI agents. Connect any MCP
              server, choose your LLM provider, and start building.
            </p>

            <div className="mt-8 desktop:mt-[65px] flex flex-col items-center space-y-6 tablet:flex-row tablet:space-y-0 tablet:gap-8">
              <Link href="/docs/quick-start">
                <Button
                  variant="secondary"
                  className="uppercase w-[216px] tablet:w-auto"
                >
                  Read Docs
                  <ArrowRightIcon className="size-6" />
                </Button>
              </Link>
              <Link
                href="https://github.com/corespeed-io/zypher-agent"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="plain"
                  className="uppercase w-[216px] tablet:w-auto border-outline-high border"
                >
                  <GithubIcon className="size-6" />
                  Github
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div
          className="desktop:w-[606px] shrink-0 desktop:border-l desktop:border-outline-low self-stretch"
          style={{
            backgroundImage: `
                linear-gradient(0deg, transparent 24%, rgba(114, 114, 114, 0.1) 25%, rgba(114, 114, 114, 0.1) 26%, transparent 27%, transparent 74%, rgba(114, 114, 114, 0.1) 75%, rgba(114, 114, 114, 0.1) 76%, transparent 77%, transparent),
                linear-gradient(90deg, transparent 24%, rgba(114, 114, 114, 0.1) 25%, rgba(114, 114, 114, 0.1) 26%, transparent 27%, transparent 74%, rgba(114, 114, 114, 0.1) 75%, rgba(114, 114, 114, 0.1) 76%, transparent 77%, transparent)
              `,
            backgroundSize: "22px 22px",
          }}
        >
          <div className="pt-5.5 pl-6 desktop:pt-[83px] h-full flex flex-col items-start">
            <Link
              href="https://jsr.io/@zypher/agent"
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://jsr.io/badges/@zypher/agent" alt="JSR" />
            </Link>

            <div className="mt-3.5 inline-flex desktop:mt-0 p-2 border items-center gap-2.5 border-brand-light-2 font-mono text-brand-base leading-[140%] bg-brand-lighter">
              <DenoIcon className="size-6 text-static-black" />
              deno add jsr:@zypher/agent
              <CopyButton />
            </div>

            <div className="mt-9 bg-bg-inverse-1 pl-1 rounded-tl-xl">
              <div className="py-3 text-text-high-inverse pl-3 text-xs">
                /main.ts
              </div>
              <div className="bg-surface-s8 pt-6 pl-4 rounded-tl-xl border-[#3e3e3e] border">
                <CodeBlock lang="typescript">{codeExample}</CodeBlock>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
