import Link from "next/link";
import { EditorMenuIcon } from "@/components/icons/editor-menu";
import { ZypherIcon } from "@/components/icons/zypher";
import { cn } from "@/lib/cn";
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
              <nav className="border-outline-high-inverse flex h-full items-center border-x font-mono text-sm">
                {/* TODO load data from baseOptions */}
                <Link
                  href="https://docs.corespeed.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-box-b3 px-4 h-full grid place-items-center"
                >
                  Docs
                </Link>
                <Link
                  href="https://jsr.io/@zypher/agent/doc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-box-b3 px-4 h-full grid place-items-center"
                >
                  API Reference
                </Link>
              </nav>
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
