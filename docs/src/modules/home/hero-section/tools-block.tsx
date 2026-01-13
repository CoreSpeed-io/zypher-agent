import * as motion from "motion/react-client";
import type { ComponentProps } from "react";
import AnimatedText from "@/components/AnimatedText";
import { cn } from "@/lib/cn";

const tools = ["Cursor", "Claude Code", "Devin", "DeckSpeed", "Lovart"];

export function ToolsBlock({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("", className)} {...props}>
      <motion.div
        className="border-y border-outline-low px-6 tablet:flex justify-center desktop:justify-start desktop:pl-12"
        layout="size"
      >
        <div
          className={cn(
            "text-text-high inline-block leading-[140%] font-semibold tracking-tight",
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
          <AnimatedText
            className="text-text-med"
            texts={tools}
            interval={2500}
          />
          <div className="bg-brand-base absolute size-[5px] left-0 top-0 -translate-x-1/2 -translate-y-1/2" />
          <div className="bg-brand-base absolute size-[5px] right-0 top-0 translate-x-1/2 -translate-y-1/2" />
          <div className="bg-brand-base absolute size-[5px] right-0 bottom-0 translate-x-1/2 translate-y-1/2" />
          <div className="bg-brand-base absolute size-[5px] left-0 bottom-0 -translate-x-1/2 translate-y-1/2" />
        </div>
      </motion.div>
    </div>
  );
}
