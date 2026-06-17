import { Database, RadioTower, ShieldCheck, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AppWithMetrics } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

interface DataReliabilityProps {
  app: AppWithMetrics;
  compact?: boolean;
}

function originLabel(origin?: string | null) {
  if (!origin) {
    return "unavailable";
  }

  const normalizedOrigin = origin.toLowerCase();

  if (normalizedOrigin === "protocol_adapter") {
    return "Protocol adapter";
  }

  return origin
    .replaceAll("_", " ")
    .replaceAll("+", " + ")
    .replace(/defillama/gi, "DefiLlama")
    .replace(/base rpc/gi, "Base RPC")
    .replace(/base-rpc/gi, "Base RPC")
    .replace(/farcaster/gi, "Farcaster")
    .replace(/neynar/gi, "Neynar");
}

function confidenceTone(confidence: string) {
  if (confidence === "high") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  }

  if (confidence === "medium") {
    return "border-blue-400/25 bg-blue-400/10 text-blue-100";
  }

  return "border-amber-400/25 bg-amber-400/10 text-amber-100";
}

function coverageTone(coverage?: string) {
  if (coverage === "high") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  }

  if (coverage === "medium") {
    return "border-cyan-400/25 bg-cyan-400/10 text-cyan-100";
  }

  return "border-white/10 bg-white/[0.04] text-muted-foreground";
}

export function DataReliability({ app, compact = false }: DataReliabilityProps) {
  const { metrics } = app;
  const verifiedContractCount = app.contractAddresses.length;
  const metricOrigin = [
    originLabel(metrics.metricOrigin ?? metrics.source),
    metrics.socialSource === "farcaster" ? "Farcaster / Neynar" : null
  ]
    .filter(Boolean)
    .join(" + ");

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <Badge className={cn("gap-1", confidenceTone(metrics.confidence))}>
          <ShieldCheck className="h-3 w-3" />
          Confidence: {metrics.confidence}
        </Badge>
        <Badge className={cn("gap-1", coverageTone(metrics.coverage))}>
          <RadioTower className="h-3 w-3" />
          Coverage: {metrics.coverage ?? "limited"}
        </Badge>
      </div>
    );
  }

  return (
    <div className="grid gap-2 text-xs sm:grid-cols-2">
      <div className={cn("rounded-md border px-3 py-2", confidenceTone(metrics.confidence))}>
        <div className="flex items-center gap-1.5 font-medium">
          <ShieldCheck className="h-3.5 w-3.5" />
          Confidence
        </div>
        <p className="mt-1 capitalize text-white">{metrics.confidence}</p>
      </div>
      <div className={cn("rounded-md border px-3 py-2", coverageTone(metrics.coverage))}>
        <div className="flex items-center gap-1.5 font-medium">
          <RadioTower className="h-3.5 w-3.5" />
          Coverage
        </div>
        <p className="mt-1 capitalize text-white">{metrics.coverage ?? "limited"}</p>
      </div>
      <div className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-muted-foreground">
        <div className="flex items-center gap-1.5 font-medium">
          <Database className="h-3.5 w-3.5" />
          Metric origin
        </div>
        <p className="mt-1 text-white">{metricOrigin}</p>
      </div>
      <div className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-muted-foreground">
        <div className="flex items-center gap-1.5 font-medium">
          <Timer className="h-3.5 w-3.5" />
          Last measured
        </div>
        <p className="mt-1 text-white">{relativeTime(metrics.measuredAt)}</p>
      </div>
      <div className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-muted-foreground sm:col-span-2">
        <p className="text-white">
          {verifiedContractCount > 0
            ? `${verifiedContractCount} verified contract${verifiedContractCount === 1 ? "" : "s"} tracked`
            : "No app-specific Base contracts verified yet"}
        </p>
      </div>
    </div>
  );
}
