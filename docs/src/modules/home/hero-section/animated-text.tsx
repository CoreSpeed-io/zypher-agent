import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function AnimatedText({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("", className)} {...props}>
      <div className="border-y border-outline-low px-6 tablet:flex justify-center">
        <div
          className={cn(
            "text-text-high inline-block leading-[140%] font-semibold tracking-tight text-center",
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
          Claude Code
          <div className="bg-brand-base absolute size-[5px] left-0 top-0 -translate-x-1/2 -translate-y-1/2" />
          <div className="bg-brand-base absolute size-[5px] right-0 top-0 translate-x-1/2 -translate-y-1/2" />
          <div className="bg-brand-base absolute size-[5px] right-0 bottom-0 translate-x-1/2 translate-y-1/2" />
          <div className="bg-brand-base absolute size-[5px] left-0 bottom-0 -translate-x-1/2 translate-y-1/2" />
        </div>
      </div>
    </div>
  );
}
