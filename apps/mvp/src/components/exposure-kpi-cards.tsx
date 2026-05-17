import { GitBranch, Network, ShieldAlert, Users } from "lucide-react";
import type { ExposureKpis } from "@/lib/db/queries";
import { formatNumber } from "@/lib/utils";

interface ExposureKpiCardsProps {
  kpis: ExposureKpis;
}

export function ExposureKpiCards({ kpis }: ExposureKpiCardsProps) {
  const cards = [
    {
      label: "Entities mapped",
      value: formatNumber(kpis.entities_mapped),
      sub: "canonical universe",
      icon: Users,
      accent: "text-teal-600 dark:text-teal-300",
      bg: "bg-teal-500/10",
    },
    {
      label: "Historical incidents",
      value: formatNumber(kpis.historical_incidents),
      sub: "synthetic + real",
      icon: ShieldAlert,
      accent: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/10",
    },
    {
      label: "Dependency edges",
      value: formatNumber(kpis.dependency_edges),
      sub: "oracles + bridges + stables",
      icon: GitBranch,
      accent: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-500/10",
    },
    {
      label: "Avg twins / entity",
      value: kpis.avg_twins_per_entity.toFixed(2),
      sub: "Method A + B + C ensemble",
      icon: Network,
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
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
                <Icon className={`h-5 w-5 ${card.accent}`} aria-hidden="true" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
