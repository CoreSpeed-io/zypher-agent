import Link from "next/link";
import { Button } from "@/components/button";
import { ArrowRightIcon } from "@/components/icons/arrow-right";
import { GithubIcon } from "@/components/icons/github";

export function HeroSection() {
  return (
    <section className="mx-auto max-w-[1440px]">
      <div className="desktop:px-0 desktop:max-w-[1196px] desktop:mx-[122px] tablet:mx-20 mx-6 border-x border-outline-low">
        <div className="pt-6 pb-8 px-6 border-b">
          <h1 className="text-4xl font-semibold leading-[130%] tracking-[-0.036em] font-mono text-center">
            <div>Build your own</div>
            <div className="my-6.5">Claude Code</div>
            <div>
              with <span className="text-brand-base">Zypher</span>
            </div>
          </h1>
        </div>

        <div className="px-6 pt-8 pb-12 border-b">
          <p className="text-text-base text-sm leading-[140%] font-mono text-pretty">
            A few lines of code to create powerful AI agents. Connect any MCP
            server, choose your LLM provider, and start building.
          </p>

          <div className="mt-8 flex flex-col items-center space-y-6">
            <Button variant="secondary" className="uppercase w-[216px]">
              Read Docs
              <ArrowRightIcon className="size-6" />
            </Button>
            <Button
              variant="plain"
              className="uppercase w-[216px] border-outline-high border"
            >
              <GithubIcon className="size-6" />
              Github
            </Button>
          </div>
        </div>

        <div>
          <div className="pt-5.5 pl-6">
            <Link
              href="https://jsr.io/@zypher/agent"
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 md:mb-8 w-fit"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://jsr.io/badges/@zypher/agent" alt="JSR" />
            </Link>

            <div className="mt-3.5 inline-block p-2 border border-brand-light-2 font-mono text-brand-base leading-[140%] bg-brand-lighter">
              deno add jsr:@zypher/agent
            </div>

            <div className="mt-9 border-l border-t border-outline-med">
              <div
                className="py-4.5 flex items-center gap-14 pl-5.5 relative"
                style={{
                  backgroundImage: `
                repeating-linear-gradient(315deg, 
                  #E5E5E5 0px, 
                  #E5E5E5 0.5px, 
                  transparent 1px, 
                  transparent 6px
                )
              `,
                }}
              >
                <ul className="flex items-center gap-4">
                  <li className="size-4 bg-state-red-base rounded-full" />
                  <li className="size-4 bg-state-yellow-base rounded-full" />
                  <li className="size-4 bg-state-green-base rounded-full" />
                </ul>
                <div className="text-text-high font-mono text-xl">main.ts</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
