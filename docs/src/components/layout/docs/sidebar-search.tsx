"use client";

import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export function SidebarSearch() {
  const { setOpenSearch, hotKey } = useSearchContext();

  return (
    <button
      type="button"
      className={cn(
        "cursor-pointer border-b border-outline-low text-text-low hover:text-text-med flex items-center px-4 py-3",
      )}
      data-search=""
      aria-label="Open Search"
      onClick={() => {
        setOpenSearch(true);
      }}
    >
      <div className="flex items-center gap-2 font-mono text-[13px] leading-[140%]">
        <Search className="size-4" />
        Search
      </div>
      <div className="ms-auto inline-flex gap-2">
        {hotKey.map((k, i) => (
          <kbd
            // biome-ignore lint/suspicious/noArrayIndexKey: ignore
            key={i}
            className="text-text-high relative text-[13px] font-mono grid bg-box-b1 size-4 shrink-0"
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
