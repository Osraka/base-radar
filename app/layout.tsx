import type { Metadata } from "next";
import { SITE_ORIGIN } from "@/lib/site";
import "./globals.css";

const isPreviewOrDevelopment = process.env.VERCEL_ENV === "preview" ||
  process.env.NODE_ENV !== "production";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "Base Radar | Base App and Coin Discovery Engine",
  description:
    "Discover measured activity across Base apps, protocols, agents, mini apps, and coins.",
  robots: isPreviewOrDevelopment
    ? { index: false, follow: false }
    : { index: true, follow: true }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}
