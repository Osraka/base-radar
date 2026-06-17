import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "pink" | "amber";
}

const toneClasses = {
  blue: "bg-primary/15 text-blue-100",
  green: "bg-emerald-400/10 text-emerald-200",
  pink: "bg-pink-400/10 text-pink-200",
  amber: "bg-amber-400/10 text-amber-200"
};

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue"
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="metric-tabular mt-2 text-2xl font-semibold text-white">{value}</p>
          {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        <div className={cn("rounded-md p-2", toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
