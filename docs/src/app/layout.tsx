import "@/app/global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { cn } from "@/lib/cn";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  adjustFontFallback: true,
});

const berkeley = localFont({
  src: "../public/font/Berkeley Mono Variable.ttf",
  variable: "--font-berkeley",
  weight: "100 900",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://zypher.corespeed.io"),
  title: "Zypher Agent",
  description:
    "A few lines of code to create powerful AI agents. Connect any MCP server, choose your LLM provider, and start building.",
  authors: [{ name: "CoreSpeed Team" }],
  creator: "CoreSpeed",
  publisher: "CoreSpeed",
  category: "technology",
  alternates: {
    canonical: "https://zypher.corespeed.io",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

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
