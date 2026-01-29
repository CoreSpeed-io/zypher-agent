import { cn } from "@/lib/utils.ts";
import { memo } from "react";
import type { HTMLAttributes } from "react";

export type ShimmerProps = HTMLAttributes<HTMLSpanElement> & {
  children: string;
  duration?: number;
};

export const Shimmer = memo(
  ({ children, className, ...props }: ShimmerProps) => (
    <span
      className={cn("animate-pulse text-muted-foreground", className)}
      {...props}
    >
      {children}
    </span>
  ),
);

Shimmer.displayName = "Shimmer";
