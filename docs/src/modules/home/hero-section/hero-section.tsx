import Link from "next/link";
import { Button } from "@/components/button";
import { ArrowRightIcon } from "@/components/icons/arrow-right";
import { DenoIcon } from "@/components/icons/deno";
import { GithubIcon } from "@/components/icons/github";
import { CopyButton } from "./copy-button";

export function HeroSection() {
  return (
    <section className="mx-auto max-w-[1440px]">
      <div className="desktop:px-0 desktop:flex desktop:items-center desktop:max-w-[1196px] desktop:mx-[122px] tablet:mx-20 mx-6 border-x border-outline-low">
        <div>
          <div className="pt-6 pb-8 tablet:pt-12 px-6 desktop:px-12 border-b">
            <h1 className="text-4xl tablet:text-5xl font-semibold leading-[130%] tracking-[-0.036em] font-mono text-center tablet:text-left">
              <div>Build your own</div>
              <div className="my-6.5">Claude Code</div>
              <div>
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
        <div className="desktop:w-[606px] shrink-0 desktop:border-l desktop:border-outline-low self-stretch">
          <div className="pt-5.5 pl-6 desktop:pt-[83px]">
            <Link
              href="https://jsr.io/@zypher/agent"
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 md:mb-8 w-fit"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://jsr.io/badges/@zypher/agent" alt="JSR" />
            </Link>

            <div className="mt-3.5 inline-flex p-2 border items-center gap-2.5 border-brand-light-2 font-mono text-brand-base leading-[140%] bg-brand-lighter">
              <DenoIcon className="size-6 text-static-black" />
              deno add jsr:@zypher/agent
              <CopyButton />
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
