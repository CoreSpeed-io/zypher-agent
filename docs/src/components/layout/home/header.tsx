import Link from "next/link";
import { EditorMenuIcon } from "@/components/icons/editor-menu";
import { ZypherIcon } from "@/components/icons/zypher";
import { cn } from "@/lib/cn";
import { LargeSearchToggle, SearchToggle } from "../search-toggle";
import { HeaderDropdown } from "./header-dropdown";

export function Header() {
  return (
    <div className="bg-static-black">
      <header
        className={cn(
          "text-static-white",
          "max-w-[1440px] overflow-hidden",
          "desktop:px-0 desktop:mx-auto",
        )}
      >
        <div className="desktop:mx-[122px] tablet:mx-20 mx-6 flex h-[88px] max-w-[1196px] items-center justify-between">
          <Link href="/">
            <ZypherIcon className="w-[199px]" />
          </Link>
          <div className="flex h-full items-center">
            <div className="desktop:flex hidden h-full">
              <nav className="border-outline-high-inverse flex h-full items-center gap-8 border-l px-4 font-mono text-sm">
                {/* TODO load data from baseOptions */}
                <Link href="/docs" target="_blank" rel="noopener noreferrer">
                  Docs
                </Link>
                <Link
                  href="https://jsr.io/@zypher/agent/doc"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  API Reference
                </Link>
              </nav>
            </div>

            <div className="h-full">
              <SearchToggle className="p-2 text-white px-4 border-x h-full rounded-none border-outline-high-inverse tablet:hidden" />
              <LargeSearchToggle className="text-sm h-full max-w-[240px] hidden tablet:inline-flex px-4 desktop:border-r cursor-pointer" />
            </div>

            <HeaderDropdown>
              <div className="px-4">
                <EditorMenuIcon className="size-5 text-white" />
              </div>
            </HeaderDropdown>
          </div>
        </div>
      </header>
    </div>
  );
}
