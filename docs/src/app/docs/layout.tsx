import { DocsLayout } from "@/components/layout/docs";
import { source } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return <DocsLayout tree={source.pageTree}>{children}</DocsLayout>;
}
