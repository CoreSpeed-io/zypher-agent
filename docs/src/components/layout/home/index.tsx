import type { ComponentProps } from "react";
import { cn } from "../../../lib/cn";
import type { BaseLayoutProps, NavOptions } from "../shared";
import { Header } from "./header";

export interface HomeLayoutProps extends BaseLayoutProps {
  nav?: Partial<
    NavOptions & {
      /**
       * Open mobile menu when hovering the trigger
       */
      enableHoverToOpen?: boolean;
    }
  >;
}

export function HomeLayout(props: ComponentProps<"main">) {
  const { ...rest } = props;

  return (
    <main
      id="nd-home-layout"
      {...rest}
      className={cn(
        "flex flex-1 flex-col [--fd-layout-width:1400px]",
        rest.className,
      )}
    >
      <Header />
      {props.children}
    </main>
  );
}
