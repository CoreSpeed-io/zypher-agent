"use client";
import * as Primitive from "fumadocs-core/toc";
import { useI18n } from "fumadocs-ui/contexts/i18n";
import { type ComponentProps, useRef } from "react";
import { cn } from "../../lib/cn";
import { mergeRefs } from "../../lib/merge-refs";
import { TocThumb, useTOCItems } from "./index";

export function TOCItems({ ref, className, ...props }: ComponentProps<"div">) {
  const containerRef = useRef<HTMLDivElement>(null);
  const items = useTOCItems();
  const { text } = useI18n();

  if (items.length === 0)
    return (
      <div className="rounded-lg border bg-fd-card p-3 text-xs text-text-med">
        {text.tocNoHeadings}
      </div>
    );

  return (
    <>
      <TocThumb
        containerRef={containerRef}
        className="absolute top-0 translate-y-(--fd-top) h-(--fd-height) w-px bg-brand-base transition-[translate,height]"
      />
      <div
        ref={mergeRefs(ref, containerRef)}
        className={cn(
          "flex flex-col border-s space-y-0.5 border-outline-low",
          className,
        )}
        {...props}
      >
        {items.map((item) => (
          <TOCItem key={item.url} item={item} />
        ))}
      </div>
    </>
  );
}

function TOCItem({ item }: { item: Primitive.TOCItemType }) {
  return (
    <Primitive.TOCItem
      href={item.url}
      className={cn(
        "prose py-1.5 tracking-[-0.02em] text-xs font-normal font-mono text-text-med transition-colors wrap-anywhere first:pt-0 last:pb-0 data-[active=true]:text-brand-base",
        item.depth <= 2 && "ps-3",
        item.depth === 3 && "ps-6",
        item.depth >= 4 && "ps-8",
      )}
    >
      {item.title}
    </Primitive.TOCItem>
  );
}
