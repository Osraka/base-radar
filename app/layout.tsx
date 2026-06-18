import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Base Radar | Base App and Coin Discovery Engine",
  description:
    "Real-time discovery engine for Base apps, protocols, agents, mini apps, and coins launching on Base."
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
