import "server-only";

import { fetchProtocolMetrics } from "@/lib/integrations/defillama";
import type {
  AdapterMetrics,
  ProtocolAdapter,
  ProtocolAdapterContext
} from "@/lib/adapters/types";

interface HybridProtocolAdapterConfig {
  slug: string;
  defillamaProtocolSlug?: string;
  defillamaBaseDexSlugs?: string[];
  defillamaBaseFeeSlugs?: string[];
  preferBaseRpcActivity?: boolean;
  supportsVolume: boolean;
  supportsUsers: boolean;
  supportsTxs: boolean;
  notes: string;
}

function isPositiveMetric(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isMetricReliable(metrics: Partial<AdapterMetrics> | null | undefined) {
  if (!metrics) {
    return false;
  }

  return (
    isPositiveMetric(metrics.tx24h) ||
    isPositiveMetric(metrics.users24h) ||
    isPositiveMetric(metrics.volume24hUsd) ||
    isPositiveMetric(metrics.fees24hUsd) ||
    isPositiveMetric(metrics.revenue24hUsd) ||
    isPositiveMetric(metrics.tvlUsd)
  );
}

export function createHybridProtocolAdapter(
  config: HybridProtocolAdapterConfig,
  context: ProtocolAdapterContext = {}
): ProtocolAdapter {
  return {
    slug: config.slug,
    supportsVolume: config.supportsVolume,
    supportsUsers: config.supportsUsers,
    supportsTxs: config.supportsTxs,
    async getMetrics() {
      try {
        const [defillamaMetrics, baseRpcMetrics] = await Promise.all([
          config.defillamaProtocolSlug
            ? fetchProtocolMetrics({
                protocolSlug: config.defillamaProtocolSlug,
                baseDexSlugs: config.defillamaBaseDexSlugs,
                baseFeeSlugs: config.defillamaBaseFeeSlugs
              })
            : Promise.resolve(null),
          context.getBaseRpcMetrics?.() ?? Promise.resolve(null)
        ]);
        const hasExternalMetrics = Boolean(
          defillamaMetrics?.dexVolume24hUsd ||
            defillamaMetrics?.fees24hUsd ||
            defillamaMetrics?.revenue24hUsd ||
            defillamaMetrics?.tvlUsd
        );
        const hasBaseRpcMetrics = Boolean(
          baseRpcMetrics?.tx24h || baseRpcMetrics?.users24h
        );
        const hasMeaningfulBaseRpcActivity = Boolean(
          (baseRpcMetrics?.tx24h ?? 0) >= 25 ||
            (baseRpcMetrics?.users24h ?? 0) >= 100
        );
        const merged: AdapterMetrics = {
          ...(config.preferBaseRpcActivity
            ? {
                tx24h: baseRpcMetrics?.tx24h,
                users24h: baseRpcMetrics?.users24h
              }
            : {
                tx24h: baseRpcMetrics?.tx24h,
                users24h: baseRpcMetrics?.users24h
              }),
          volume24hUsd: defillamaMetrics?.dexVolume24hUsd,
          fees24hUsd: defillamaMetrics?.fees24hUsd,
          revenue24hUsd: defillamaMetrics?.revenue24hUsd,
          tvlUsd: defillamaMetrics?.tvlUsd,
          confidence:
            hasExternalMetrics && hasMeaningfulBaseRpcActivity
              ? "high"
              : hasExternalMetrics || hasBaseRpcMetrics
                ? "medium"
                : "low",
          source: [
            defillamaMetrics ? "defillama" : null,
            hasBaseRpcMetrics ? "base_rpc" : null
          ]
            .filter(Boolean)
            .join("+") || "protocol_adapter",
          coverage:
            hasExternalMetrics && hasMeaningfulBaseRpcActivity
              ? "high"
              : hasExternalMetrics || hasBaseRpcMetrics
                ? "medium"
                : "limited",
          notes: [
            config.notes,
            defillamaMetrics?.notes,
            hasBaseRpcMetrics
              ? hasMeaningfulBaseRpcActivity
                ? "Base RPC contract-log activity is an estimate."
                : "Base RPC activity sample is present but limited; tx and wallet counts may be hidden."
              : null
          ]
            .filter(Boolean)
            .join(" ")
        };

        return merged;
      } catch {
        return {
          confidence: "low",
          source: "protocol_adapter",
          coverage: "limited",
          notes: `${config.notes} Adapter failed gracefully; metrics unavailable.`
        };
      }
    }
  };
}
