import { cn } from "@fumadocs/ui/cn";
import {
  CircleCheck,
  CircleX,
  Info,
  Lightbulb,
  TriangleAlert,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export type CalloutType =
  | "info"
  | "warn"
  | "error"
  | "success"
  | "warning"
  | "idea";

const iconClass = "size-5 -me-0.5 fill-(--callout-color) text-text-white";

export function Callout({
  children,
  title,
  ...props
}: { title?: ReactNode } & Omit<CalloutContainerProps, "title">) {
  return (
    <CalloutContainer {...props}>
      {title && <CalloutTitle>{title}</CalloutTitle>}
      <CalloutDescription>{children}</CalloutDescription>
    </CalloutContainer>
  );
}

export interface CalloutContainerProps extends ComponentProps<"div"> {
  /**
   * @defaultValue info
   */
  type?: CalloutType;

  /**
   * Force an icon
   */
  icon?: ReactNode;
}

function resolveAlias(type: CalloutType) {
  if (type === "warn") return "warning";
  if ((type as unknown) === "tip") return "info";
  return type;
}

export function CalloutContainer({
  type: inputType = "info",
  icon,
  children,
  className,
  style,
  ...props
}: CalloutContainerProps) {
  const type = resolveAlias(inputType);

  return (
    <div
      className={cn(
        "flex gap-2 my-4 rounded-sm border border-outline-med bg-bg-b0 p-4 text-sm text-text-high",
        className,
      )}
      style={
        {
          "--callout-color": `var(--color-fd-${type}, var(--color-fd-muted))`,
          ...style,
        } as object
      }
      {...props}
    >
      {icon ??
        {
          info: <Info className={iconClass} />,
          warning: <TriangleAlert className={iconClass} />,
          error: <CircleX className={iconClass} />,
          success: <CircleCheck className={iconClass} />,
          idea: (
            <Lightbulb className="size-5 -me-0.5 fill-(--callout-color) text-(--callout-color)" />
          ),
        }[type]}
      <div className="flex flex-col gap-2 min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function CalloutTitle({
  children,
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p className={cn("font-medium  font-mono my-0!", className)} {...props}>
      {children}
    </p>
  );
}

export function CalloutDescription({
  children,
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <div
      className={cn(
        "text-text-med leading-[140%] [&_p]:text-text-med [&_p]:text-sm [&_p]:leading-[140%] prose-no-margin empty:hidden",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
