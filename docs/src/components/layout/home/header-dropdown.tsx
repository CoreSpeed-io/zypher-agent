"use client";

import { Popover } from "@base-ui/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { DiscordIcon } from "@/components/icons/discord";
import { LinkedinIcon } from "@/components/icons/linkedin";
import { XIcon } from "@/components/icons/x";
import { cn } from "@/lib/cn";

export function HeaderDropdown({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [open]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
      }}
    >
      <Popover.Trigger
        className={cn(
          "flex h-full items-center justify-center",
          "border-outline-high-inverse",
          "tablet:border-r tablet:px-4",
          "desktop:hidden",
        )}
      >
        {children}
      </Popover.Trigger>

      <Popover.Portal
        className={cn(
          "bg-static-black desktop:hidden tablet:border-outline-base fixed inset-0 top-[88px] z-1000 max-h-[calc(100dvh-88px)] overflow-hidden border-t-[0.5px]",
        )}
      >
        <Popover.Positioner
          className="w-dvw"
          arrowPadding={0}
          collisionPadding={0}
        >
          <Popover.Popup
            className="text-static-white pt-1 text-lg leading-[140%] font-medium"
            onClick={() => {
              setOpen(false);
            }}
          >
            <Link
              href="/docs"
              className="border-outline-base block border-b-[0.5px] p-6"
            >
              Docs
            </Link>
            <Link
              href="https://jsr.io/@zypher/agent/doc"
              className="border-outline-base block border-b-[0.5px] p-6"
            >
              API Reference
            </Link>

            <div className="border-outline-base tablet:border-b-0 flex items-center border-b-[0.5px] px-6 py-4 text-base">
              <Link
                className="flex flex-1 items-center justify-center gap-2 py-4"
                href="https://discord.gg/9CVxeWvsp9"
                target="_blank"
              >
                <DiscordIcon className="size-4" />
              </Link>
              <div className="bg-outline-high mx-2 h-[30px] w-px shrink-0" />
              <Link
                className="flex flex-1 items-center justify-center gap-2 py-4"
                href="https://x.com/CoreSpeed_Inc"
                target="_blank"
              >
                <XIcon className="size-4" />
              </Link>
              <div className="bg-outline-high mx-2 h-[30px] w-px shrink-0" />
              <Link
                className="flex flex-1 items-center justify-center gap-2 py-4"
                href="https://x.com/CoreSpeed_Inc"
                target="_blank"
              >
                <LinkedinIcon className="size-4" />
              </Link>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
