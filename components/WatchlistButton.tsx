"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { useWatchlist } from "@/components/useWatchlist";
import { toggleWatchlist, type WatchlistKind } from "@/lib/watchlist";
import { cn } from "@/lib/utils";

interface WatchlistButtonProps {
  kind: WatchlistKind;
  id: string;
  label: string;
  compact?: boolean;
}

export function WatchlistButton({ kind, id, label, compact = false }: WatchlistButtonProps) {
  const entries = useWatchlist();
  const [error, setError] = useState("");
  const saved = entries.some((entry) =>
    entry.kind === kind && entry.id === (kind === "coin" ? id.toLowerCase() : id)
  );

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        aria-label={`${saved ? "Remove" : "Save"} ${label} ${saved ? "from" : "to"} watchlist`}
        aria-pressed={saved}
        title={saved ? "Remove from watchlist" : "Save to watchlist"}
        onClick={() => setError(toggleWatchlist({ kind, id, label })
          ? "" : "Unable to save locally. Check browser storage or the 100-item limit.")}
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-white/15 px-3 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          saved && "border-primary/40 bg-primary/10 text-blue-100"
        )}
      >
        <Star className={cn("h-4 w-4", saved && "fill-current")} />
        {compact ? null : saved ? "Saved" : "Save"}
      </button>
      {error ? <span role="status" className="mt-1 text-xs text-rose-300">{error}</span> : null}
    </span>
  );
}
