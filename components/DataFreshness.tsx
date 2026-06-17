import { AlertTriangle, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";

interface DataFreshnessProps {
  lastUpdated: string | null;
  isStale: boolean;
  staleAfterMinutes?: number;
  className?: string;
}

export function DataFreshness({
  lastUpdated,
  isStale,
  staleAfterMinutes,
  className
}: DataFreshnessProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
        className
      )}
    >
      <Badge
        variant={isStale ? "warning" : "secondary"}
        className={cn(
          "gap-1.5",
          !isStale && "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
        )}
      >
        {isStale ? <AlertTriangle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
        {isStale ? "Data stale" : "Live snapshot"}
      </Badge>
      <span>
        Last updated{" "}
        <span className="text-white">
          {lastUpdated ? relativeTime(lastUpdated) : "not available"}
        </span>
        {staleAfterMinutes ? ` · stale after ${staleAfterMinutes}m` : ""}
      </span>
    </div>
  );
}
