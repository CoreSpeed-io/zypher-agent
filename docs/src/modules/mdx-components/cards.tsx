import { cn } from "@fumadocs/ui/cn";
import Link from "fumadocs-core/link";
import { ChevronRight } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

export function Cards(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("grid grid-cols-2 gap-3 @container", props.className)}
    >
      {props.children}
    </div>
  );
}

export type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;

  href?: string;
  external?: boolean;
};

export function Card({ icon, title, description, ...props }: CardProps) {
  const E = props.href ? Link : "div";

  return (
    <E
      {...props}
      data-card
      className={cn(
        "block rounded-sm border bg-bg-b0 p-4  no-underline px-4 py-3  transition-colors @max-lg:col-span-full",
        props.href && "hover:bg-surface-s1",
        props.className,
      )}
    >
      {icon ? (
        <div className="not-prose mb-2 w-fit border rounded-sm bg-bg-b0 border-outline-low p-1.5 text-text-high [&_svg]:size-4">
          {icon}
        </div>
      ) : null}
      <h3 className="not-prose flex items-start justify-between text-sm font-mono text-text-high">
        {title}
      </h3>
      {description ? (
        <p className="mb-0! text-[13px] text-text-low font-normal mt-2">
          {description}
        </p>
      ) : null}
      <div className="text-[13px] text-text-high mt-2 font-normal prose-no-margin empty:hidden">
        {props.children}
      </div>
    </E>
  );
}
