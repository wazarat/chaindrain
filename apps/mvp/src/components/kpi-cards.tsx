import {
  AlertTriangle,
  AlertOctagon,
  DollarSign,
  Radio,
} from "lucide-react";
import type { KpiSummary } from "@/lib/db/queries";
import { formatNumber, formatUsdCompact } from "@/lib/utils";

interface KpiCardsProps {
  kpis: KpiSummary;
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const cards = [
    {
      label: "Critical risk",
      value: formatNumber(kpis.critical_count),
      sub: `of ${formatNumber(kpis.total_entities)} entities`,
      icon: AlertOctagon,
      accent: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/10",
    },
    {
      label: "High risk",
      value: formatNumber(kpis.high_count),
      sub: "tier — high",
      icon: AlertTriangle,
      accent: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-500/10",
    },
    {
      label: "Total TVL",
      value: formatUsdCompact(kpis.total_tvl_usd),
      sub: "across covered protocols",
      icon: DollarSign,
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Total blast radius",
      value: formatUsdCompact(kpis.total_blast_radius_usd),
      sub: "potential downstream USD impact",
      icon: Radio,
      accent: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {card.label}
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight">
                  {card.value}
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {card.sub}
                </div>
              </div>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.bg}`}
              >
                <Icon className={`h-5 w-5 ${card.accent}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
