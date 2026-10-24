"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { FileCheck2, ShieldCheck, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { AppWithMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ClaimAppPanelProps {
  app: AppWithMetrics;
}

export function ClaimAppPanel({ app }: ClaimAppPanelProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <FileCheck2 className="h-4 w-4" />
        Request claim review
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-white/10 bg-[#08111f] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Listing review
                </p>
                <h2 id={titleId} className="mt-2 text-xl font-semibold text-white">
                  Request review for {app.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-muted-foreground transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Close claim modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
              <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-blue-100">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    This form requests manual review. It does not verify your
                    identity or grant ownership of this listing.
                  </p>
                </div>
              </div>
              <p>
                Explain your connection to the project in the description and
                provide an official contact. A verified builder label requires
                independent proof and moderator approval; neither is available
                through this form yet.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Link
                href={`/submit?claim=${app.slug}`}
                className={cn(buttonVariants(), "justify-center")}
              >
                Submit review request
              </Link>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
