import { Badge } from "@/components/ui/badge.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { cn } from "@/lib/utils.ts";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { CodeBlock } from "./code-block.tsx";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

// --------------------------------------------------------------------------
// Tool
// --------------------------------------------------------------------------

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "group/tool not-prose mb-4 w-full rounded-md border",
      className,
    )}
    {...props}
  />
);

// --------------------------------------------------------------------------
// ToolHeader
// --------------------------------------------------------------------------

export type ToolHeaderProps = {
  title: string;
  state: ToolState;
  className?: string;
};

const statusLabels: Record<ToolState, string> = {
  "input-streaming": "Running",
  "input-available": "Running",
  "output-available": "Completed",
  "output-error": "Error",
};

const statusIcons: Record<ToolState, ReactNode> = {
  "input-streaming": <CircleIcon className="size-3 animate-pulse" />,
  "input-available": <ClockIcon className="size-3 animate-pulse" />,
  "output-available": <CheckCircleIcon className="size-3 text-green-600" />,
  "output-error": <XCircleIcon className="size-3 text-red-600" />,
};

export const ToolHeader = ({ className, title, state }: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full items-center justify-between gap-4 p-3",
      className,
    )}
  >
    <div className="flex items-center gap-2">
      <WrenchIcon className="size-4 text-muted-foreground" />
      <span className="font-medium text-sm">{title}</span>
      <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
        {statusIcons[state]}
        {statusLabels[state]}
      </Badge>
    </div>
    <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180" />
  </CollapsibleTrigger>
);

// --------------------------------------------------------------------------
// ToolContent
// --------------------------------------------------------------------------

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn("border-t", className)}
    {...props}
  />
);

// --------------------------------------------------------------------------
// ToolInput
// --------------------------------------------------------------------------

export type ToolInputProps = ComponentProps<"div"> & {
  input: unknown;
};

export const ToolInput = (
  { className, input, ...props }: ToolInputProps,
) => (
  <div className={cn("space-y-2 overflow-hidden p-4", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      Parameters
    </h4>
    <div className="rounded-md bg-muted/50">
      <CodeBlock
        code={typeof input === "string"
          ? input
          : JSON.stringify(input, null, 2)}
        language="json"
      />
    </div>
  </div>
);

// --------------------------------------------------------------------------
// ToolOutput
// --------------------------------------------------------------------------

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: string;
  errorText?: string;
};

export const ToolOutput = (
  { className, output, errorText, ...props }: ToolOutputProps,
) => {
  if (!output && !errorText) return null;

  return (
    <div className={cn("space-y-2 border-t p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground",
        )}
      >
        <CodeBlock code={errorText || output || ""} language="json" />
      </div>
    </div>
  );
};
