import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { ZypherIcon } from "@/components/icons/zypher";

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export function baseOptions(): BaseLayoutProps {
  return {
    themeSwitch: {
      enabled: false,
    },
    nav: {
      title: <ZypherIcon className="text-black" />,
    },
    // see https://fumadocs.dev/docs/ui/navigation/links
    links: [
      {
        text: "API Reference",
        url: "https://jsr.io/@zypher/agent/doc",
        external: true,
      },
    ],
  };
}
