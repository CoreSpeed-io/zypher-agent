import "@/app/global.css";
import { RootProvider } from "fumadocs-ui/provider/next";

import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { cn } from "@/lib/cn";

const inter = Inter({
  subsets: ["latin"],
});

const berkeley = localFont({
  src: "../public/font/Berkeley Mono Variable.ttf",
  variable: "--font-berkeley",
  weight: "100 900",
  display: "swap",
});

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "flex flex-col min-h-screen",
          berkeley.variable,
          inter.className,
        )}
      >
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
