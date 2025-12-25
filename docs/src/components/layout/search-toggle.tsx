"use client";
import { useI18n } from "fumadocs-ui/contexts/i18n";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";
import type { ButtonProps } from "../ui/button";

interface SearchToggleProps
  extends Omit<ComponentProps<"button">, "color">,
    ButtonProps {
  hideIfDisabled?: boolean;
}

export function SearchToggle({
  hideIfDisabled,
  size = "icon-sm",
  color = "ghost",
  ...props
}: SearchToggleProps) {
  const { setOpenSearch, enabled } = useSearchContext();
  if (hideIfDisabled && !enabled) return null;

  return (
    <button
      type="button"
      className={cn("cursor-pointer text-static-white", props.className)}
      data-search=""
      aria-label="Open Search"
      onClick={() => {
        setOpenSearch(true);
      }}
    >
      <Search className="size-4" />
    </button>
  );
}

export function LargeSearchToggle({
  hideIfDisabled,
  ...props
}: ComponentProps<"button"> & {
  hideIfDisabled?: boolean;
}) {
  const { enabled, hotKey, setOpenSearch } = useSearchContext();
  const { text } = useI18n();
  if (hideIfDisabled && !enabled) return null;

  return (
    <button
      type="button"
      data-search-full=""
      {...props}
      className={cn(
        "inline-flex items-center text-white gap-2 font-mono border-outline-high-inverse border-x",
        props.className,
      )}
      onClick={() => {
        setOpenSearch(true);
      }}
    >
      <Search className="size-4" />
      <div className="min-w-[88px] text-left">{text.search}</div>
      <div className="ms-auto inline-flex gap-2">
        {hotKey.map((k, i) => (
          <kbd
            key={i}
            className="text-text-high-inverse relative text-sm font-mono grid bg-box-b3 size-4 shrink-0"
          >
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
              {k.display}
            </div>
          </kbd>
        ))}
      </div>
    </button>
  );
}
