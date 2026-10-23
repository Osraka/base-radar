import Link from "next/link";
import { ArrowRight, Coins } from "lucide-react";
import type { BaseTokenTrend, TokenRadarBucket } from "@/lib/tokens/types";
import { formatCurrency, relativeTime } from "@/lib/utils";

interface CoinRadarPreviewProps {
  radar: {
    source: string;
    coverage: string;
    generatedAt: string;
    buckets: Record<TokenRadarBucket, BaseTokenTrend[]>;
  };
}

export function CoinRadarPreview({ radar }: CoinRadarPreviewProps) {
  const seen = new Set<string>();
  const preview = [...radar.buckets.fresh, ...radar.buckets.volume]
    .filter((token) => {
      if (!token.contractAddress || token.safetyStatus === "excluded") return false;
      const address = token.contractAddress.toLowerCase();
      if (seen.has(address)) return false;
      seen.add(address);
      return true;
    })
    .slice(0, 3);

  return (
    <section className="border-y border-white/10 bg-white/[0.015]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold text-white">Coin Radar</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              A small market snapshot. Coins are separate from app rankings.
            </p>
          </div>
          <Link href="/coins" className="inline-flex h-11 items-center gap-1 text-sm font-medium text-blue-100 hover:text-white">
            Open coin tracker <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {preview.length > 0 ? (
          <div className="mt-5 grid gap-0 border-t border-white/10 md:grid-cols-3">
            {preview.map((token) => (
              <Link
                key={token.contractAddress}
                href={`/coins/${encodeURIComponent(token.contractAddress ?? "")}`}
                className="min-w-0 border-b border-white/10 px-0 py-4 transition hover:bg-white/[0.035] md:px-4 md:first:pl-0 md:last:pr-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium text-white">{token.tokenSymbol ?? token.tokenName ?? "Unknown token"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{token.riskLevel ?? "unknown"} risk</span>
                </div>
                <p className="mt-1 text-sm text-white">24h volume {formatCurrency(token.volume24hUsd)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {token.source ?? radar.source} · observed {relativeTime(token.lastSeenAt ?? token.detectedAt)} · {token.confidence} confidence
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No currently verified coin snapshot is available. The coin tracker shows source and coverage details.</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          New and low-liquidity tokens can be high risk. Discovery data is not an investment recommendation.
        </p>
      </div>
    </section>
  );
}
