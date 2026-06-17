import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SubmitAppForm } from "@/components/SubmitAppForm";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Submit Your App | Base Radar",
  description: "Submit a Base app to be reviewed for Base Radar rankings."
};

interface SubmitPageProps {
  searchParams?: Promise<{
    claim?: string;
  }>;
}

export default async function SubmitPage({ searchParams }: SubmitPageProps) {
  const resolvedSearchParams = await searchParams;
  const claimSlug = resolvedSearchParams?.claim ?? "";

  return (
    <>
      <Header />
      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="terminal-grid absolute inset-0 opacity-60" />
          <div className="relative mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-primary">
              Manual review pipeline
            </p>
            <h1 className="text-4xl font-semibold tracking-normal text-white sm:text-5xl">
              Submit or claim a Base app.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Add the app, contracts, social links, and builder context needed for
              review. Apps are manually reviewed before approval; contract addresses
              and Builder Codes are verified before metrics are tracked.
            </p>
            <div className="mt-6 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <p className="font-medium text-white">1. Submit</p>
                <p className="mt-1">Share the canonical website, category, and contact.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <p className="font-medium text-white">2. Verify</p>
                <p className="mt-1">We check official docs, Basescan, and contract ownership.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <p className="font-medium text-white">3. Track</p>
                <p className="mt-1">Approved apps enter rankings once coverage is credible.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <SubmitAppForm claimSlug={claimSlug} />
            </CardContent>
          </Card>
        </section>
      </main>
      <Footer />
    </>
  );
}
