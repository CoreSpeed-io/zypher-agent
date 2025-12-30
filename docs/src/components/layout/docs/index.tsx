import type * as PageTree from "fumadocs-core/page-tree";
import { TreeContextProvider } from "fumadocs-ui/contexts/tree";
import { ArrowUpRight, BoxIcon, Sidebar as SidebarIcon } from "lucide-react";
import Link from "next/link";
import {
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
  useMemo,
} from "react";
import { ZypherIcon } from "@/components/icons/zypher";
import { cn } from "../../../lib/cn";
import { buttonVariants } from "../../ui/button";
import { SearchToggle } from "../search-toggle";
import { type BaseLayoutProps, renderTitleNav } from "../shared";
import type { SidebarPageTreeComponents } from "../sidebar/page-tree";
import { type GetSidebarTabsOptions, getSidebarTabs } from "../sidebar/tabs";
import {
  SidebarTabsDropdown,
  type SidebarTabWithProps,
} from "../sidebar/tabs/dropdown";
import {
  LayoutBody,
  LayoutContextProvider,
  LayoutHeader,
  LayoutTabs,
} from "./client";
import {
  Sidebar,
  SidebarCollapseTrigger,
  SidebarContent,
  SidebarPageTree,
  SidebarTrigger,
  SidebarViewport,
} from "./sidebar";
import { SidebarSearch } from "./sidebar-search";

export interface DocsLayoutProps extends BaseLayoutProps {
  tree: PageTree.Root;

  sidebar?: SidebarOptions;

  tabMode?: "top" | "auto";

  /**
   * Props for the `div` container
   */
  containerProps?: HTMLAttributes<HTMLDivElement>;
}

interface SidebarOptions
  extends ComponentProps<"aside">,
    Pick<ComponentProps<typeof Sidebar>, "defaultOpenLevel" | "prefetch"> {
  enabled?: boolean;
  component?: ReactNode;
  components?: Partial<SidebarPageTreeComponents>;

  /**
   * Root Toggle options
   */
  tabs?: SidebarTabWithProps[] | GetSidebarTabsOptions | false;

  banner?: ReactNode;
  footer?: ReactNode;

  /**
   * Support collapsing the sidebar on desktop mode
   *
   * @defaultValue true
   */
  collapsible?: boolean;
}

export function DocsLayout({
  nav: { transparentMode, ...nav } = {},
  sidebar: {
    tabs: sidebarTabs,
    enabled: sidebarEnabled = true,
    defaultOpenLevel,
    prefetch,
    ...sidebarProps
  } = {},
  searchToggle = {},
  themeSwitch = {},
  tabMode = "auto",
  i18n = false,
  children,
  tree,
  ...props
}: DocsLayoutProps) {
  const tabs = useMemo(() => {
    if (Array.isArray(sidebarTabs)) {
      return sidebarTabs;
    }
    if (typeof sidebarTabs === "object") {
      return getSidebarTabs(tree, sidebarTabs);
    }
    if (sidebarTabs !== false) {
      return getSidebarTabs(tree);
    }
    return [];
  }, [tree, sidebarTabs]);

  function sidebar() {
    const {
      banner,
      collapsible = true,
      component,
      components,
      ...rest
    } = sidebarProps;
    if (component) return component;

    const viewport = (
      <SidebarViewport>
        <SidebarPageTree {...components} />
      </SidebarViewport>
    );

    return (
      <SidebarContent {...rest}>
        <div className="flex flex-col px-0 pt-4">
          <div className="flex px-4 pb-4 border-outline-low">
            <Link
              href={"/"}
              className="inline-flex text-[0.9375rem] items-center gap-2.5 font-medium me-auto"
            >
              <ZypherIcon />
            </Link>
            {nav.children}
          </div>
          <SidebarSearch />
          {tabs.length > 0 && tabMode === "auto" && (
            <SidebarTabsDropdown options={tabs} />
          )}
          {banner}
        </div>
        {viewport}
      </SidebarContent>
    );
  }

  return (
    <TreeContextProvider tree={tree}>
      <LayoutContextProvider navTransparentMode={transparentMode}>
        <Sidebar defaultOpenLevel={defaultOpenLevel} prefetch={prefetch}>
          <LayoutBody {...props.containerProps}>
            {nav.enabled !== false &&
              (nav.component ?? (
                <LayoutHeader
                  id="nd-subnav"
                  className="[grid-area:header] sticky top-(--fd-docs-row-1) z-30 flex items-center ps-4 pe-2.5 border-b transition-colors backdrop-blur-sm h-(--fd-header-height) md:hidden max-md:layout:[--fd-header-height:--spacing(14)] data-[transparent=false]:bg-fd-background/80"
                >
                  {renderTitleNav(nav, {
                    className: "inline-flex items-center gap-2.5 font-semibold",
                  })}
                  <div className="flex-1">{nav.children}</div>
                  {searchToggle.enabled !== false &&
                    (searchToggle.components?.sm ?? (
                      <SearchToggle
                        className="p-2 text-text-high"
                        hideIfDisabled
                      />
                    ))}
                  {sidebarEnabled && (
                    <SidebarTrigger
                      className={cn(
                        buttonVariants({
                          color: "ghost",
                          size: "icon-sm",
                          className: "p-2",
                        }),
                      )}
                    >
                      <SidebarIcon />
                    </SidebarTrigger>
                  )}
                </LayoutHeader>
              ))}
            {sidebarEnabled && sidebar()}
            {tabMode === "top" && tabs.length > 0 && (
              <LayoutTabs
                options={tabs}
                className="z-10 bg-fd-background border-b px-6 pt-3 xl:px-8 max-md:hidden"
              />
            )}
            {children}
          </LayoutBody>
        </Sidebar>
      </LayoutContextProvider>
    </TreeContextProvider>
  );
}
