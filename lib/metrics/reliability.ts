import type { AppMetrics, BaseApp, MetricCoverage } from "@/lib/types";

type AppLike = Pick<BaseApp, "slug" | "name"> &
  Partial<Pick<BaseApp, "contractAddresses">>;

const KNOWN_MAJOR_PROTOCOLS = new Set([
  "uniswap-base",
  "aerodrome",
  "aave-base",
  "moonwell",
  "zora",
  "compound-v3-base",
  "extra-finance",
  "seamless-protocol",
  "morpho-base",
  "spark-base",
  "pancakeswap-base",
  "curve-base",
  "pendle-base",
  "fluid-base",
  "euler-base",
  "yearn-base",
  "balancer-base",
  "quickswap-base",
  "sushiswap-base",
  "layerzero-base",
  "hyperlane-base",
  "axelar-base",
  "superfluid-base",
  "beefy-base",
  "reserve-protocol",
  "across-protocol-base",
  "stargate-base"
]);

const MEANINGFUL_TVL_USD = 1_000_000;
const MEANINGFUL_VOLUME_24H_USD = 100_000;
const MEANINGFUL_FEES_24H_USD = 500;

export function isKnownMajorProtocol(app: AppLike) {
  return KNOWN_MAJOR_PROTOCOLS.has(app.slug);
}

function isProtocolAdapterMetric(metric: AppMetrics) {
  return metric.source === "protocol_adapter";
}

function hasVerifiedContractCoverage(app: AppLike) {
  return (app.contractAddresses?.length ?? 0) > 0;
}

function hasMeaningfulEconomicSignal(metric: AppMetrics) {
  return (
    (metric.volume24hUsd ?? metric.volume24h) >= MEANINGFUL_VOLUME_24H_USD ||
    (metric.tvlUsd ?? 0) >= MEANINGFUL_TVL_USD ||
    (metric.fees24hUsd ?? 0) >= MEANINGFUL_FEES_24H_USD
  );
}

function hasWeakActivityBesideStrongEconomics(metric: AppMetrics) {
  return isProtocolAdapterMetric(metric) && hasMeaningfulEconomicSignal(metric);
}

function hasHighConfidenceUserSource(metric: AppMetrics) {
  return (
    metric.source === "builder_codes" &&
    metric.confidence === "high" &&
    metric.users24h > 0
  );
}

function hasHighConfidenceTxSource(metric: AppMetrics) {
  return (
    metric.source === "builder_codes" &&
    (metric.confidence === "medium" || metric.confidence === "high") &&
    metric.tx24h > 0
  );
}

export function isUserMetricReliable(metric: AppMetrics, app: AppLike) {
  if (metric.users24h <= 0) {
    return false;
  }

  if (hasHighConfidenceUserSource(metric)) {
    return true;
  }

  if (
    hasWeakActivityBesideStrongEconomics(metric) &&
    (isKnownMajorProtocol(app) || !hasVerifiedContractCoverage(app)) &&
    metric.users24h < 100
  ) {
    return false;
  }

  return metric.coverage !== "limited" && metric.coverage !== "experimental";
}

export function isTxMetricReliable(metric: AppMetrics, app: AppLike) {
  if (metric.tx24h <= 0) {
    return false;
  }

  if (hasHighConfidenceTxSource(metric)) {
    return true;
  }

  if (
    hasWeakActivityBesideStrongEconomics(metric) &&
    (isKnownMajorProtocol(app) || !hasVerifiedContractCoverage(app)) &&
    metric.tx24h < 25
  ) {
    return false;
  }

  return metric.coverage !== "experimental";
}

export function shouldShowNumericUsers(metric: AppMetrics, app: AppLike) {
  return isUserMetricReliable(metric, app);
}

export function shouldShowNumericTxs(metric: AppMetrics, app: AppLike) {
  return isTxMetricReliable(metric, app);
}

function coverageLabel(coverage?: MetricCoverage) {
  if (coverage === "high") {
    return "High coverage";
  }

  if (coverage === "medium") {
    return "Medium coverage";
  }

  if (coverage === "experimental") {
    return "Experimental";
  }

  return "Limited coverage";
}

export function getMetricDisplayState(metric: AppMetrics, app: AppLike) {
  const showNumericUsers = shouldShowNumericUsers(metric, app);
  const showNumericTxs = shouldShowNumericTxs(metric, app);
  const coverage = coverageLabel(metric.coverage);
  const isHybrid = metric.source === "protocol_adapter";
  const hasContracts = hasVerifiedContractCoverage(app);
  const isExternalOnly =
    isHybrid &&
    !hasContracts &&
    (metric.metricOrigin?.includes("defillama") || metric.source === "protocol_adapter");
  const isEstimated =
    metric.source === "base_rpc" ||
    metric.source === "protocol_adapter" ||
    metric.confidence === "low";

  return {
    users: {
      label: "Tracked Wallets",
      showNumeric: showNumericUsers,
      valueWhenHidden: metric.users24h > 0
        ? "Limited coverage"
        : "No verified wallet activity tracked yet",
      caption: showNumericUsers
        ? "Tracked wallets from available data sources."
        : metric.users24h > 0
          ? "Tracked wallet estimate is limited for this app."
          : "No verified wallet activity is tracked for this app yet."
    },
    txs: {
      label: "24h TXs",
      showNumeric: showNumericTxs,
      valueWhenHidden: metric.tx24h > 0
        ? "Limited"
        : "No verified contract activity tracked yet",
      caption: showNumericTxs
        ? "Tracked activity from configured sources."
        : metric.tx24h > 0
          ? "Only activity from tracked contracts."
          : "No verified contract activity is tracked for this app yet."
    },
    badges: [
      coverage,
      ...(isExternalOnly ? ["External data"] : []),
      ...(hasContracts ? ["Contracts verified"] : []),
      ...(isHybrid ? ["Hybrid"] : []),
      ...(isEstimated ? ["Estimated"] : [])
    ]
  };
}

export function getEconomicMetricDisplayState(metric: AppMetrics) {
  const volume24h = metric.volume24hUsd ?? metric.volume24h;

  if (volume24h > 0) {
    return {
      label: "24h Volume",
      showNumeric: true,
      value: volume24h,
      valueWhenHidden: "Limited coverage",
      caption: "Protocol volume from the highest-confidence available source."
    };
  }

  if ((metric.tvlUsd ?? 0) > 0) {
    return {
      label: "TVL",
      showNumeric: true,
      value: metric.tvlUsd ?? 0,
      valueWhenHidden: "Limited coverage",
      caption: "TVL from the highest-confidence available source."
    };
  }

  if ((metric.fees24hUsd ?? 0) > 0) {
    return {
      label: "24h Fees",
      showNumeric: true,
      value: metric.fees24hUsd ?? 0,
      valueWhenHidden: "Limited coverage",
      caption: "Fee signal from the highest-confidence available source."
    };
  }

  if ((metric.revenue24hUsd ?? 0) > 0) {
    return {
      label: "24h Revenue",
      showNumeric: true,
      value: metric.revenue24hUsd ?? 0,
      valueWhenHidden: "Limited coverage",
      caption: "Revenue signal from the highest-confidence available source."
    };
  }

  return {
    label: "Economic Signal",
    showNumeric: false,
    value: 0,
    valueWhenHidden: "No verified economic source yet",
    caption: "Economic metrics are not available for this app yet."
  };
}

export function isSocialDataUnavailable(metric: AppMetrics) {
  const notes = metric.notes?.toLowerCase() ?? "";

  return (
    (metric.socialSource === null || metric.socialConfidence === "low") &&
    (metric.socialMentions7d ?? metric.socialMentions24h) === 0 &&
    (notes.includes("neynar") ||
      notes.includes("social metric fetch failed") ||
      notes.includes("social data temporarily unavailable"))
  );
}

export function getSocialDisplayState(metric: AppMetrics) {
  if (isSocialDataUnavailable(metric)) {
    return {
      showNumeric: false,
      value: "Social data temporarily unavailable",
      caption: "Neynar/Farcaster social sampling is unavailable for this refresh."
    };
  }

  const mentions = metric.socialMentions7d ?? metric.socialMentions24h;

  if (mentions <= 0) {
    return {
      showNumeric: false,
      value: "Social source unavailable",
      caption: "No reliable Farcaster social source is available for this app yet."
    };
  }

  return {
    showNumeric: true,
    value: mentions,
    caption: `${metric.socialConfidence ?? "low"} confidence 7d Farcaster sample.`
  };
}

export function userReliabilityWeight(metric: AppMetrics, app?: AppLike) {
  if (!app) {
    return 1;
  }

  return isUserMetricReliable(metric, app) ? 1 : 0.2;
}

export function txReliabilityWeight(metric: AppMetrics, app?: AppLike) {
  if (!app) {
    return 1;
  }

  return isTxMetricReliable(metric, app) ? 1 : 0.35;
}

export function economicReliabilityWeight(metric: AppMetrics, app?: AppLike) {
  if (
    metric.source === "protocol_adapter" &&
    ((metric.volume24hUsd ?? 0) > 0 ||
      (metric.fees24hUsd ?? 0) > 0 ||
      (metric.tvlUsd ?? 0) > 0)
  ) {
    if (app && !hasVerifiedContractCoverage(app)) {
      return 0.78;
    }

    return 1.18;
  }

  return 1;
}
