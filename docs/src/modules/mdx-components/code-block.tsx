/** biome-ignore-all lint/a11y/useSemanticElements: <explanation> */
/** biome-ignore-all lint/a11y/noNoninteractiveTabindex: <explanation> */
"use client";

import { useCopyButton } from "@fumadocs/ui/hooks/use-copy-button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "fumadocs-ui/components/ui/tabs";
import type {
  ComponentProps,
  HTMLAttributes,
  ReactNode,
  RefObject,
} from "react";
import { createContext, use, useMemo, useRef } from "react";
import { CheckIcon } from "@/components/icons/check";
import { CopyIcon } from "@/components/icons/copy";
import { cn } from "@/lib/cn";

export interface CodeBlockProps extends ComponentProps<"figure"> {
  /**
   * Allow to copy code with copy button
   *
   * @defaultValue true
   */
  allowCopy?: boolean;

  viewportProps?: HTMLAttributes<HTMLElement>;

  /**
   * show line numbers
   */
  "data-line-numbers"?: boolean;

  /**
   * @defaultValue 1
   */
  "data-line-numbers-start"?: number;

  Actions?: (props: { className?: string; children?: ReactNode }) => ReactNode;
}

const TabsContext = createContext<{
  containerRef: RefObject<HTMLDivElement | null>;
  nested: boolean;
} | null>(null);

export function Pre(props: ComponentProps<"pre">) {
  return (
    <pre
      {...props}
      className={cn("w-max min-w-full *:flex *:flex-col", props.className)}
    >
      {props.children}
    </pre>
  );
}

export function CodeBlock({
  ref,
  title,
  allowCopy = true,

  viewportProps = {},
  children,
  // eslint-disable-next-line react/no-nested-component-definitions
  Actions = (props) => (
    <div {...props} className={cn("empty:hidden", props.className)} />
  ),
  ...props
}: CodeBlockProps) {
  const inTab = use(TabsContext) !== null;
  const areaRef = useRef<HTMLDivElement>(null);

  return (
    <figure
      dir="ltr"
      {...props}
      tabIndex={-1}
      className={cn(
        inTab
          ? "bg-fd-secondary -mx-px -mb-px last:rounded-b-xl"
          : "bg-surface-s8 my-4 rounded-lg",

        "shiki not-prose font-mono relative overflow-hidden border-[#3e3e3e] text-sm",
        props.className,
      )}
      style={{
        boxShadow: "0 0 4px 0 rgba(215, 215, 231, 0.16) inset",
        ...props.style,
      }}
    >
      {title ? (
        <div className="text-text-high-inverse bg-bg-inverse-1 flex items-center gap-2 px-4 py-3">
          <figcaption className="flex-1 truncate font-mono text-xs leading-[140%]">
            {title}
          </figcaption>
          {Actions({
            className: "-me-2",
            children: allowCopy && <CopyButton containerRef={areaRef} />,
          })}
        </div>
      ) : (
        Actions({
          className:
            "absolute top-2 right-2 z-2  rounded-lg text-fd-muted-foreground",
          children: allowCopy && <CopyButton containerRef={areaRef} />,
        })
      )}
      <div className={cn(title && "mx-1 mb-1")}>
        <div
          ref={areaRef}
          {...viewportProps}
          role="region"
          tabIndex={0}
          className={cn(
            "border-outline-base-inverse max-h-[600px] border bg-[#2A2A2A] py-3.5 focus-visible:outline-none focus-visible:ring-inset",
            "overflow-auto",
            "desktop:text-sm tablet:text-sm text-xs font-light",
            "rounded-lg",

            viewportProps.className,
          )}
          style={
            {
              // space for toolbar
              "--padding-right": !title
                ? "calc(var(--spacing) * 8)"
                : undefined,
              counterSet: props["data-line-numbers"]
                ? `line ${Number(props["data-line-numbers-start"] ?? 1) - 1}`
                : undefined,
              ...viewportProps.style,
            } as object
          }
        >
          {children}
        </div>
      </div>
    </figure>
  );
}

function CopyButton({
  className,
  containerRef,
  ...props
}: ComponentProps<"button"> & {
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [checked, onClick] = useCopyButton(() => {
    const pre = containerRef.current?.getElementsByTagName("pre").item(0);
    if (!pre) {
      return;
    }

    const clone = pre.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".nd-copy-ignore").forEach((node) => {
      node.replaceWith("\n");
    });

    void navigator.clipboard.writeText(clone.textContent ?? "");
  });

  return (
    <button
      type="button"
      data-checked={checked || undefined}
      className={cn("text-text-low mr-1 size-3", className)}
      aria-label={checked ? "Copied Text" : "Copy Text"}
      onClick={onClick}
      {...props}
    >
      {checked ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

export function CodeBlockTabs({
  className,
  ...props
}: ComponentProps<typeof Tabs>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nested = use(TabsContext) !== null;

  return (
    <Tabs {...props} className={cn(!nested && "my-4", className)}>
      <TabsContext
        value={useMemo(
          () => ({
            containerRef,
            nested,
          }),
          [nested],
        )}
      >
        {props.children}
      </TabsContext>
    </Tabs>
  );
}

export function CodeBlockTabsList({
  className,
  ...props
}: ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      {...props}
      className={cn(
        "text-text-med flex flex-row gap-6 overflow-x-auto",
        "border-b-outline-low border-b",
        className,
      )}
    >
      {props.children}
    </TabsList>
  );
}

export function CodeBlockTabsTrigger({
  children,
  className,
  ...props
}: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      {...props}
      className={cn(
        "group relative inline-flex items-center gap-2 py-1.5 font-mono text-sm font-medium text-nowrap transition-colors [&_svg]:size-3.5",
        "data-[state=active]:text-brand-base",
        "hover:text-text-low data-[state=active]:hover:text-brand-base",

        className,
      )}
    >
      <div className="group-data-[active]:bg-brand-base absolute inset-x-0 bottom-0 h-px" />
      {children}
    </TabsTrigger>
  );
}

export function CodeBlockTab(props: ComponentProps<typeof TabsContent>) {
  return (
    <TabsContent
      {...props}
      className={cn(
        "pt-4",

        props.className,
      )}
    />
  );
}
