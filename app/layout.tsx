import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Base Radar | DexScreener for Base Apps",
  description:
    "Discover what is trending across Base apps, builders, agents, and onchain growth."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="dark" data-scroll-behavior="smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}
