import type { Metadata } from "next";
import { ModeratorClaimsConsole } from "@/components/ModeratorClaimsConsole";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { isClaimWorkflowEnabled } from "@/lib/claims/auth";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Claim Review | Base Radar",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default function BuilderClaimsAdminPage() {
  return (
    <>
      <Header />
      <main className="mx-auto min-h-[70vh] max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 border-b border-white/10 pb-6">
          <p className="text-xs font-medium uppercase text-primary">Private review</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Builder claims</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Domain proof is one review signal. Approve only after independently checking the
            project&apos;s official references and the stored app website.
          </p>
        </div>
        <ModeratorClaimsConsole
          configured={isSupabaseServerConfigured()}
          claimsEnabled={isClaimWorkflowEnabled()}
        />
      </main>
      <Footer />
    </>
  );
}
