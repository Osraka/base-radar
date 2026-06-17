import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatPercent } from "@/lib/utils";

interface MetricBadgeProps {
  value: number | null;
  label?: string;
}

export function MetricBadge({ value, label = "24h" }: MetricBadgeProps) {
  if (value === null) {
    return (
      <Badge className="gap-1 border-blue-400/30 bg-blue-400/10 text-blue-100 metric-tabular">
        <Sparkles className="h-3 w-3" />
        New
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
