import { TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatPercent } from "@/lib/utils";

interface MetricBadgeProps {
  value: number | null;
  label?: string;
}

export function MetricBadge({ value, label = "24h" }: MetricBadgeProps) {
  if (value === null) {
    return (
      <Badge
        className="metric-tabular border-white/10 bg-white/[0.04] text-muted-foreground"
        title="24h growth needs a verified previous-day baseline."
        aria-label="24h growth unavailable: no verified previous-day baseline"
      >
        —
      </Badge>
    );
  }

  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <Badge
      variant={positive ? "success" : "warning"}
      className={cn(
        "gap-1 metric-tabular",
        !positive && "border-rose-400/30 bg-rose-400/10 text-rose-200"
      )}
    >
      <Icon className="h-3 w-3" />
      {formatPercent(value)} {label}
    </Badge>
  );
}
