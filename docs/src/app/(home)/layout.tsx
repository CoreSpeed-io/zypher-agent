import { HomeLayout } from "@/components/layout/home";

export default function Layout({ children }: LayoutProps<"/">) {
  return <HomeLayout>{children}</HomeLayout>;
}
