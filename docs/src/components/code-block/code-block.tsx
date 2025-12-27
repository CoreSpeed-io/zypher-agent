import type { BundledLanguage } from "shiki";
import { codeToHtml } from "shiki";
import { cn } from "@/lib/cn";

interface Props {
  children: string;
  lang: BundledLanguage;
}

export async function CodeBlock(props: Props) {
  const out = await codeToHtml(props.children, {
    lang: props.lang,
    theme: "vesper",
    colorReplacements: {
      "#99ffe4": "#ff5e4f",
      "#ffc799": "#FFF",
    },
  });

  return (
    <div
      className={cn(
        "overflow-x-scroll",
        "[&_pre]:bg-transparent!",
        "desktop:text-base tablet:text-sm text-xs",
        "[&_code]:[counter-increment:step_0]",
        "[&_code]:[counter-reset:step]",
        "[&_code_.line::before]:text-text-low-inverse",
        "[&_code_.line::before]:mr-6",
        "[&_code_.line::before]:inline-block",
        "[&_code_.line::before]:w-4",
        "[&_code_.line::before]:text-right",
        "[&_code_.line::before]:content-[counter(step)]",
        "[&_code_.line::before]:[counter-increment:step]",
      )}
      style={{
        // @ts-expect-error - this is a custom property
        "--default-mono-font-family": "var(--font-berkeley)",
      }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: ignore
      dangerouslySetInnerHTML={{ __html: out }}
    />
  );
}
