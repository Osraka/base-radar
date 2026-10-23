import type { Metadata } from "next";
import { DashboardClient } from "@/components/DashboardClient";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getBaseTokenRadar } from "@/lib/tokens/data";
import { getBaseSocialTrends } from "@/lib/social/trends";
import { getRadarSnapshot } from "@/lib/data";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  alternates: { canonical: siteUrl("/") }
};

export default async function HomePage() {
  const [snapshot, socialTrends, tokenRadar] = await Promise.all([
    getRadarSnapshot(),
    getBaseSocialTrends(8),
    getBaseTokenRadar(12)
  ]);

  return (
    <>
      <Header />
      <DashboardClient
        apps={snapshot.apps}
        globalLastUpdated={snapshot.globalLastUpdated}
        isDataStale={snapshot.isDataStale}
        staleAfterMinutes={snapshot.staleAfterMinutes}
        socialTrends={socialTrends}
        tokenRadar={tokenRadar}
      />
      <Footer />
    </>
  );
}
