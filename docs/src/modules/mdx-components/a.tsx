import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function A(props: ComponentProps<"a">) {
  return (
    <a
      {...props}
      className={cn(
        "decoration-[#006bff] underline-offset-4 not-prose text-sm text-[#006bff] no-underline hover:text-[#006bff]! hover:underline",
        props.className,
      )}
    />
  );
}
