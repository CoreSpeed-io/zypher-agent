import type { ComponentProps } from "react";

export function CrossIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M6 4H10V6H6V10H4V6H0V4H4V0H6V4Z" fill="currentColor" />
    </svg>
  );
}
