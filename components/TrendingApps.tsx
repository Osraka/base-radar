import { AppCard } from "@/components/AppCard";
import { EmptyState } from "@/components/EmptyState";
import type { AppWithMetrics } from "@/lib/types";

interface TrendingAppsProps {
  apps: AppWithMetrics[];
  rankById?: Map<string, number>;
}

export function TrendingApps({ apps, rankById }: TrendingAppsProps) {
  if (apps.length === 0) {
    return (
      <EmptyState
        title="Bu filtrede trend app yok."
        description="Kategori veya arama terimini değiştirerek Base ekosistemini taramaya devam edin."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {apps.slice(0, 6).map((app, index) => (
        <AppCard key={app.id} app={app} rank={rankById?.get(app.id) ?? index + 1} />
      ))}
    </div>
  );
}
