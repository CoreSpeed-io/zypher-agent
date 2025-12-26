import Image from "next/image";
import Link from "next/link";
import { CoreSpeedIcon } from "@/components/icons/corespeed";
import { DiscordIcon } from "@/components/icons/discord";
import { GithubIcon } from "@/components/icons/github";
import { LinkedinIcon } from "@/components/icons/linkedin";
import { XIcon } from "@/components/icons/x";
import { cn } from "@/lib/cn";
import FooterDots from "./footer-dots.png";

export function FooterSection() {
  return (
    <footer className="overflow-hidden font-mono">
      <div className="bg-bg-inverse-1 border-outline-base-inverse relative border-y">
        <div className="mx-auto max-w-[1440px]">
          <Image
            src={FooterDots}
            alt="Footer Dots"
            className="absolute bottom-0 left-0"
            width={423}
            height={384}
          />
          <div
            className={cn(
              "relative z-10 font-mono",
              "desktop:px-0 desktop:mx-[122px] tablet:mx-20 mx-6 py-12",
              "max-w-[1196px]",
              "desktop:flex-row desktop:justify-between flex flex-col",
            )}
          >
            <div className="py-5">
              <Link href="/">
                <CoreSpeedIcon className="tablet:w-80 w-[226px]" />
              </Link>
            </div>

            <div className="mt-9 flex flex-col gap-3">
              <h5 className="text-text-high-inverse text-lg font-semibold">
                PRODUCTS
              </h5>
              <div className="text-text-base-inverse flex flex-col gap-3 text-sm">
                <Link href="https://zypher.corespeed.io" target="_blank">
                  Zypher Agent Framework
                </Link>
                <Link href="https://dash.corespeed.io" target="_blank">
                  Runtime PaaS
                </Link>
                <Link href="https://mcp.corespeed.io/" target="_blank">
                  MCP Store
                </Link>
                <Link href="https://deckspeed.com" target="_blank">
                  DeckSpeed
                </Link>
                <Link href="https://calspeed.ai" target="_blank">
                  CalSpeed
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-bg-inverse-2 desktop:px-0 py-12">
        <div className="mx-auto max-w-[1440px]">
          <div
            className={cn(
              "desktop:flex-row desktop:gap-0 desktop:justify-between desktop:items-center flex flex-col gap-8",
              "desktop:mx-[122px] tablet:mx-20 mx-6 max-w-[1196px]",
            )}
          >
            <div className="text-text-high-inverse flex items-center gap-6">
              <Link
                href="https://github.com/corespeed-io/zypher-agent"
                target="_blank"
              >
                <GithubIcon className="size-5" />
              </Link>
              <Link
                href="https://www.linkedin.com/company/corespeed-inc/"
                target="_blank"
              >
                <LinkedinIcon className="size-5" />
              </Link>
              <Link href="https://discord.gg/9CVxeWvsp9" target="_blank">
                <DiscordIcon className="size-5" />
              </Link>
              <Link href="https://x.com/CoreSpeed_Inc" target="_blank">
                <XIcon className="size-5" />
              </Link>
            </div>
            <div className="text-text-med-inverse text-xs tracking-[-0.01em]">
              Copyright © {new Date().getFullYear()} CoreSpeed Inc. All Rights
              Reserved
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
