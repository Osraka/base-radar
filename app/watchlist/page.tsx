import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { WatchlistClient } from "@/components/WatchlistClient";
import { getRankedApps } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Watchlist | Base Radar",
  robots: { index: false, follow: false }
};

export default async function WatchlistPage() {
  const apps = await getRankedApps();
  return (
    <>
      <Header />
      <WatchlistClient apps={apps} />
      <Footer />
    </>
  );
}
