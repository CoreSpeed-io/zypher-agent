"use client";
import { cva } from "class-variance-authority";
import { Sidebar as SidebarIcon } from "lucide-react";
import { type ComponentProps, useRef } from "react";
import { cn } from "../../../lib/cn";
import { mergeRefs } from "../../../lib/merge-refs";
import { buttonVariants } from "../../ui/button";
import * as Base from "../sidebar/base";
import { createLinkItemRenderer } from "../sidebar/link-item";
import { createPageTreeRenderer } from "../sidebar/page-tree";

const itemVariants = cva(
  "relative flex flex-row tracking-[-0.02em] cursor-pointer text-[13px] border-b broder-outline-low items-center gap-2 leading-[140%] px-4 py-3 text-start text-text-high font-mono wrap-anywhere [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        link: "transition-colors hover:text-text-high hover:bg-surface-s1 hover:transition-none data-[active=true]:bg-brand-lighter/50 data-[active=true]:text-brand-base data-[active=true]:hover:transition-colors",
        button:
          "transition-colors hover:text-text-high hover:bg-surface-s1 hover:transition-none",
      },
      highlight: {
        // true: "data-[active=true]:before:content-[''] data-[active=true]:before:bg-brand-base data-[active=true]:before:absolute data-[active=true]:before:w-px data-[active=true]:before:inset-y-2.5 data-[active=true]:before:start-2.5",
      },
    },
  },
);

function getItemOffset(depth: number) {
  return `calc(${4 + 3 * depth} * var(--spacing))`;
}

export {
  SidebarCollapseTrigger,
  SidebarFolder,
  SidebarProvider as Sidebar,
  SidebarTrigger,
  SidebarViewport,
} from "../sidebar/base";

export function SidebarContent({
  ref: refProp,
  className,
  children,
  ...props
}: ComponentProps<"aside">) {
  const ref = useRef<HTMLElement>(null);

  return (
    <Base.SidebarContent>
      {({ collapsed, hovered, ref: asideRef, ...rest }) => (
        <>
          <div
            data-sidebar-placeholder=""
            className="sticky top-(--fd-docs-row-1) z-20 [grid-area:sidebar] pointer-events-none *:pointer-events-auto h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] md:layout:[--fd-sidebar-width:268px] max-md:hidden"
          >
            {collapsed && (
              <div className="absolute start-0 inset-y-0 w-4" {...rest} />
            )}
            <aside
              id="nd-sidebar"
              ref={mergeRefs(ref, refProp, asideRef)}
              data-collapsed={collapsed}
              data-hovered={collapsed && hovered}
              className={cn(
                "absolute flex flex-col w-full start-0 inset-y-0 items-end border-outline-low bg-bg-b1 text-sm border-e duration-250 *:w-(--fd-sidebar-width)",
                collapsed && [
                  "inset-y-2 rounded-xl transition-transform border w-(--fd-sidebar-width)",
                  hovered
                    ? "shadow-lg translate-x-2 rtl:-translate-x-2"
                    : "-translate-x-(--fd-sidebar-width) rtl:translate-x-full",
                ],
                ref.current &&
                  (ref.current.getAttribute("data-collapsed") === "true") !==
                    collapsed &&
                  "transition-[width,inset-block,translate,background-color]",
                className,
              )}
              {...props}
              {...rest}
            >
              {children}
            </aside>
          </div>
          <div
            data-sidebar-panel=""
            className={cn(
              "fixed flex top-[calc(--spacing(4)+var(--fd-docs-row-3))] start-4 shadow-lg transition-opacity rounded-xl p-0.5 border bg-fd-muted text-fd-muted-foreground z-10",
              (!collapsed || hovered) && "pointer-events-none opacity-0",
            )}
          >
            <Base.SidebarCollapseTrigger
              className={cn(
                buttonVariants({
                  color: "ghost",
                  size: "icon-sm",
                  className: "rounded-lg",
                }),
              )}
            >
              <SidebarIcon />
            </Base.SidebarCollapseTrigger>
          </div>
        </>
      )}
    </Base.SidebarContent>
  );
}

export function SidebarDrawer({
  children,
  className,
  ...props
}: ComponentProps<typeof Base.SidebarDrawerContent>) {
  return (
    <>
      <Base.SidebarDrawerOverlay className="fixed z-40 inset-0 data-[state=open]:animate-fd-fade-in data-[state=closed]:animate-fd-fade-out" />
      <Base.SidebarDrawerContent
        className={cn(
          "fixed text-[0.9375rem] flex flex-col end-0 inset-y-0 w-[85%] max-w-[380px] z-40 bg-bg-b1 data-[state=open]:animate-fd-sidebar-in data-[state=closed]:animate-fd-sidebar-out",
          className,
        )}
        {...props}
      >
        {children}
      </Base.SidebarDrawerContent>
    </>
  );
}

export function SidebarSeparator({
  className,
  style,
  children,
  ...props
}: ComponentProps<"p">) {
  const depth = Base.useFolderDepth();

  return (
    <Base.SidebarSeparator
      className={cn("[&_svg]:size-4 [&_svg]:shrink-0", className)}
      style={{
        paddingInlineStart: getItemOffset(depth),
        ...style,
      }}
      {...props}
    >
      {children}
    </Base.SidebarSeparator>
  );
}

export function SidebarItem({
  className,
  style,
  children,
  ...props
}: ComponentProps<typeof Base.SidebarItem>) {
  const depth = Base.useFolderDepth();

  return (
    <Base.SidebarItem
      className={cn(
        // @ts-expect-error the type of highlight is incorrect
        itemVariants({ variant: "link", highlight: depth >= 1 }),
        className,
      )}
      style={{
        paddingInlineStart: getItemOffset(depth),
        ...style,
      }}
      {...props}
    >
      {children}
    </Base.SidebarItem>
  );
}

export function SidebarFolderTrigger({
  className,
  style,
  ...props
}: ComponentProps<typeof Base.SidebarFolderTrigger>) {
  const { depth, collapsible } = Base.useFolder()!;

  return (
    <Base.SidebarFolderTrigger
      className={cn(
        itemVariants({ variant: collapsible ? "button" : null }),
        "w-full",
        className,
      )}
      style={{
        paddingInlineStart: getItemOffset(depth - 1),
        ...style,
      }}
      {...props}
    >
      {props.children}
    </Base.SidebarFolderTrigger>
  );
}

export function SidebarFolderLink({
  className,
  style,
  ...props
}: ComponentProps<typeof Base.SidebarFolderLink>) {
  const depth = Base.useFolderDepth();

  return (
    <Base.SidebarFolderLink
      className={cn(
        // @ts-expect-error the type of highlight is incorrect
        itemVariants({ variant: "link", highlight: depth > 1 }),
        "w-full",
        className,
      )}
      style={{
        paddingInlineStart: getItemOffset(depth - 1),
        ...style,
      }}
      {...props}
    >
      {props.children}
    </Base.SidebarFolderLink>
  );
}

export function SidebarFolderContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Base.SidebarFolderContent>) {
  // const depth = Base.useFolderDepth();

  return (
    <Base.SidebarFolderContent
      className={cn(
        "relative",
        // depth === 1 &&
        //   "before:content-[''] before:absolute before:w-px before:inset-y-1 before:bg-fd-border before:start-2.5",
        className,
      )}
      {...props}
    >
      {children}
    </Base.SidebarFolderContent>
  );
}

export const SidebarPageTree = createPageTreeRenderer({
  SidebarFolder: Base.SidebarFolder,
  SidebarFolderContent,
  SidebarFolderLink,
  SidebarFolderTrigger,
  SidebarItem,
  SidebarSeparator,
});

export const SidebarLinkItem = createLinkItemRenderer({
  SidebarFolder: Base.SidebarFolder,
  SidebarFolderContent,
  SidebarFolderLink,
  SidebarFolderTrigger,
  SidebarItem,
});
