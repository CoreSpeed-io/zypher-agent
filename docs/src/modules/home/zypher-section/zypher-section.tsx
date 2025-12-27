import * as motion from "motion/react-client";
import type { ComponentProps } from "react";
import { CrossIcon } from "@/components/icons/cross";
import { cn } from "@/lib/cn";
import { AgentIllustration } from "./agent-illustration";
import { CoreSpeedIllustration } from "./corespeed-illustration";
import { HoverIndicator } from "./hover-indicator";
import { MCPIllustration } from "./mcp-illustration";
import { MultiAgentIllustration } from "./multi-agent-illustration";
import { PipelineIllustration } from "./pipeline-illustration";
import { ProvidersIllustration } from "./providers-illustration";
import { TokenIllustration } from "./token-illustration";

const features = [
  {
    title: "True Agent, Not Workflow",
    description:
      "A reactive execution loop where the agent decides each next step via LLM reasoning — no predefined workflow paths required.",
    className:
      "desktop:border-t-0 desktop:border-l-0 desktop:inline-flex desktop:flex-col-reverse desktop:[&_.description]:border-t-0 desktop:[&_.description]:border-b",
    illustrationRenderer: () => (
      <div className="tablet:h-[438px] desktop:h-[425px] h-[364px] pt-3 pb-4">
        <AgentIllustration className="size-full" />
      </div>
    ),
  },
  {
    className: "desktop:mb-0 desktop:border-b-0 desktop:border-l-0",
    title: "Model & Provider Agnostic",
    description:
      "Works with Anthropic Claude, OpenAI GPT, and more models through a unified interface — with native support for each provider's unique features.",
    illustrationRenderer: () => (
      <div className="tablet:h-[300px] desktop:h-[200px] h-[300px] px-4 py-6">
        <ProvidersIllustration className="size-full" />
      </div>
    ),
  },
  {
    title: "Multi-Agent Architecture",
    description:
      "Break complex tasks into subtasks handled by specialized sub-agents — with automatic context sharing and coordinated handoffs.",
    className: "desktop:border-t-0!",
    illustrationRenderer: () => (
      <div className="tablet:h-[300px] desktop:h-[223px] h-[300px] py-8">
        <MultiAgentIllustration className="size-full" />
      </div>
    ),
  },
  {
    title: "Extensible Interceptor Pipeline",
    description:
      "A post-reasoning pipeline with built-in tool execution, error handling, and token controls, plus support for custom interceptors.",
    className:
      "desktop:pt-1.5 desktop:border-b-0 desktop:mb-0 desktop:inline-flex desktop:flex-col-reverse desktop:[&_.description]:border-t-0 desktop:[&_.description]:border-b",
    illustrationRenderer: () => (
      <div className="tablet:h-[364px] desktop:h-[413px] h-[364px]">
        <PipelineIllustration className="size-full" />
      </div>
    ),
  },
  {
    title: "Rich Tools + MCP Protocol",
    description:
      "A comprehensive tool system for file ops, execution, vision, and documents, with MCP protocol support for unlimited extensibility.",
    className: "desktop:border-t-0! desktop:border-r-0",
    illustrationRenderer: () => (
      <div className="tablet:h-[364px] desktop:h-[400px] flex h-[364px] px-6 py-12">
        <MCPIllustration className="size-full" />
      </div>
    ),
  },
  {
    className:
      "desktop:pb-3 desktop:mb-0 desktop:border-b-0 desktop:border-r-0",
    title: "Token-Efficient by Design",
    description: `Load only what's needed into context. Load agent skills and MCP tool definitions on-demand, programmatic tool use that keeps intermediate results out of context, and prompt caching — minimal tokens, maximum efficiency.`,
    illustrationRenderer: () => (
      <div className="tablet:h-[300px] desktop:h-[194px] h-[300px] px-6">
        <TokenIllustration className="size-full" />
      </div>
    ),
  },
];

export function ZypherSection({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section className={cn("bg-bg-b2", className)} {...props}>
      <div className="border-outline-med desktop:border-x border-t mx-auto max-w-[1440px]">
        <div className="desktop:mx-[122px] tablet:mx-20 border-outline-med relative font-mono mx-6 desktop:max-w-[1196px] border-x px-6 py-12 desktop:px-12 desktop:py-[95px]">
          <h3 className="text-text-high text-2xl tablet:text-[28px] leading-[140%] font-semibold tracking-tight text-balance">
            Everything you need to <br className="hidden desktop:block" /> build{" "}
            <span className="text-brand-base">AI agents</span>
          </h3>
          <p className="mt-6 text-text-med leading-[140%]">
            A minimal yet powerful framework for creating AI agents with{" "}
            <br className="hidden desktop:block" /> full control over tools,
            providers, and execution flow.
          </p>
          <CoreSpeedIllustration className="absolute bottom-0 right-0 hidden desktop:block" />
        </div>
      </div>

      <div className="desktop:border-x border-outline-med relative mx-auto max-w-[1440px] border-t">
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(315deg,#e5e5e5_0px,#e5e5e5_1px,transparent_1px,transparent_10px)]" />
        <div
          className={cn(
            "desktop:mx-[122px] tablet:mx-20 desktop:border-x border-outline-med bg-bg-b2 relative mx-6 max-w-[1196px]",
          )}
        >
          <CrossIcon className="text-outline-high absolute top-0 left-0 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2" />
          <CrossIcon className="text-outline-high absolute top-0 right-0 z-10 size-2.5 translate-x-1/2 -translate-y-1/2" />
          <CrossIcon className="text-outline-high desktop:block absolute bottom-0 left-0 z-10 hidden size-2.5 -translate-x-1/2 translate-y-1/2" />
          <CrossIcon className="text-outline-high desktop:block absolute right-0 bottom-0 z-10 hidden size-2.5 translate-x-1/2 translate-y-1/2" />

          <ul className="desktop:grid-cols-3 desktop:block desktop:columns-3 desktop:gap-4 min-[1000px]:grid min-[1000px]:grid-cols-2 min-[1000px]:gap-x-4">
            {features.map((feature, idx) => (
              <motion.li
                initial="initial"
                whileHover="hover"
                key={feature.title}
                className={cn(
                  "group",
                  "desktop:inline-block",
                  "bg-bg-b1 border-outline-low desktop:border-y relative border-x",
                  "desktop:pb-0 desktop:mb-4 pb-4",
                  "desktop:bg-bg-b1 hover:bg-bg-b0",
                  idx === features.length - 1 && "pb-0",
                  feature.className,
                )}
              >
                <div className="group relative">
                  <HoverIndicator />
                  <div className="absolute inset-0 bg-[radial-gradient(#D9D9D9_1px,transparent_0)] bg-size-[12px_12px] opacity-80 tablet:opacity-50" />
                  <div className="relative z-10">
                    {feature.illustrationRenderer?.()}
                  </div>
                </div>
                <div className="border-outline-med font-mono desktop:py-8 desktop:px-6 description space-y-2.5 border-t px-4 py-6">
                  <h5 className="text-text-base text-lg font-semibold group-hover:text-brand-base transition-colors">
                    {feature.title}
                  </h5>
                  <div className="text-text-med text-xs leading-[18px] tracking-[-0.01em]">
                    {feature.description}
                  </div>
                </div>

                {idx !== features.length - 1 && (
                  <div className="border-outline-med bg-bg-b2 absolute bottom-0 left-1/2 h-4 w-screen -translate-x-1/2 border-y min-[1000px]:hidden" />
                )}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-bg-b2 border-y border-outline-med max-w-[1440px] mx-auto desktop:border-x">
        <div className="h-12 mx-auto max-w-[1194px] desktop:border-x-0 border-inherit" />
      </div>
    </section>
  );
}
