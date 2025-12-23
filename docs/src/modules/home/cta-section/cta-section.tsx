import Link from "next/link";
import { Button } from "@/components/button";
import { ArrowRightIcon } from "@/components/icons/arrow-right";
import { cn } from "@/lib/cn";
import { Illustration } from "./illustration";

export function CTASection() {
  return (
    <section className="bg-bg-b1">
      <div className="border-outline-med desktop:border-x border-t mx-auto max-w-[1440px]">
        <div className="desktop:mx-[122px] tablet:mx-20 border-outline-med relative font-mono mx-6 max-w-[1196px] border-x  py-12">
          <div className="border-y border-outline-low px-6">
            <h3
              className={cn(
                "text-text-high text-2xl text-[32px] leading-[140%] font-semibold tracking-tight text-center",
                "p-2 border-x border-outline-low relative",
              )}
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
              Ready to build your first agent?
              <div className="bg-brand-base absolute size-[5px] left-0 top-0 -translate-x-1/2 -translate-y-1/2" />
              <div className="bg-brand-base absolute size-[5px] right-0 top-0 translate-x-1/2 -translate-y-1/2" />
              <div className="bg-brand-base absolute size-[5px] right-0 bottom-0 translate-x-1/2 translate-y-1/2" />
              <div className="bg-brand-base absolute size-[5px] left-0 bottom-0 -translate-x-1/2 translate-y-1/2" />
            </h3>
          </div>

          <div className="pt-[55px] pb-[72px] grid place-items-center">
            <Link href="/docs/quick-start">
              <Button variant="secondary" className="uppercase w-[216px]">
                Read Docs
                <ArrowRightIcon className="size-6" />
              </Button>
            </Link>
          </div>

          <div
            className="border-t border-outline-low py-[50px] grid place-items-center overflow-hidden"
            style={{
              backgroundImage: `
                linear-gradient(0deg, transparent 24%, rgba(114, 114, 114, 0.1) 25%, rgba(114, 114, 114, 0.1) 26%, transparent 27%, transparent 74%, rgba(114, 114, 114, 0.1) 75%, rgba(114, 114, 114, 0.1) 76%, transparent 77%, transparent),
                linear-gradient(90deg, transparent 24%, rgba(114, 114, 114, 0.1) 25%, rgba(114, 114, 114, 0.1) 26%, transparent 27%, transparent 74%, rgba(114, 114, 114, 0.1) 75%, rgba(114, 114, 114, 0.1) 76%, transparent 77%, transparent)
              `,
              backgroundSize: "22px 22px",
            }}
          >
            <Illustration className="tablet:w-[70vw]" />
          </div>
        </div>
      </div>
    </section>
  );
}
