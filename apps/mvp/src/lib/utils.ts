import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const usdFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatUsdCompact(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return usdCompact.format(n);
}

export function formatUsdFull(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return usdFull.format(n);
}

export function formatNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

export function formatRiskScore(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(4);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function riskTierClass(tier: string | null | undefined) {
  switch (tier) {
    case "critical":
      return "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300 ring-1 ring-red-500/30";
    case "high":
      return "bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300 ring-1 ring-orange-500/30";
    case "medium":
      return "bg-yellow-500/15 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300 ring-1 ring-yellow-500/30";
    case "low":
      return "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 ring-1 ring-emerald-500/30";
    default:
      return "bg-zinc-500/10 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300 ring-1 ring-zinc-500/20";
  }
}

export function riskScoreColor(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "text-zinc-500";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "text-zinc-500";
  if (n >= 0.7) return "text-red-600 dark:text-red-400 font-semibold";
  if (n >= 0.5) return "text-orange-600 dark:text-orange-400 font-semibold";
  if (n >= 0.3) return "text-yellow-600 dark:text-yellow-400";
  return "text-emerald-600 dark:text-emerald-400";
}

export function coverageTierClass(tier: string | null | undefined) {
  switch (tier) {
    case "core":
      return "bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 ring-1 ring-blue-500/30";
    case "monitored":
      return "bg-purple-500/15 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 ring-1 ring-purple-500/30";
    case "archive":
      return "bg-zinc-500/15 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300 ring-1 ring-zinc-500/30";
    case "excluded":
      return "bg-zinc-500/5 text-zinc-500 dark:text-zinc-500 ring-1 ring-zinc-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300 ring-1 ring-zinc-500/20";
  }
}

export function severityClass(severity: string | null | undefined) {
  switch (severity) {
    case "critical":
      return "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300 ring-1 ring-red-500/30";
    case "high":
      return "bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300 ring-1 ring-orange-500/30";
    case "medium":
      return "bg-yellow-500/15 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300 ring-1 ring-yellow-500/30";
    case "low":
      return "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 ring-1 ring-emerald-500/30";
    default:
      return "bg-zinc-500/10 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300 ring-1 ring-zinc-500/20";
  }
}

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  stablecoin_depeg: "Stablecoin depeg",
  oracle_deviation: "Oracle deviation",
  bridge_pause: "Bridge pause",
  admin_tx: "Admin transaction",
  tvl_drop: "TVL drop",
};

export function signalTypeLabel(signalType: string | null | undefined): string {
  if (!signalType) return "—";
  return SIGNAL_TYPE_LABELS[signalType] ?? signalType;
}

const DEPENDENCY_FIELD_LABELS: Record<string, string> = {
  stablecoin_dependencies: "Stablecoin",
  oracle_providers: "Oracle",
  bridge_dependencies: "Bridge",
  chain_deployments: "Chain",
  admin_address: "Admin address",
  defillama_slug: "DefiLlama slug",
};

export function dependencyFieldLabel(
  field: string | null | undefined,
): string {
  if (!field) return "—";
  return DEPENDENCY_FIELD_LABELS[field] ?? field;
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatRelativeTime(
  value: string | Date | null | undefined,
  now: Date = new Date(),
) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const diffMs = now.getTime() - d.getTime();
  const futurePrefix = diffMs < 0 ? "in " : "";
  const suffix = diffMs < 0 ? "" : " ago";
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "just now";
  if (abs < hour) {
    const n = Math.round(abs / minute);
    return `${futurePrefix}${n} min${n === 1 ? "" : "s"}${suffix}`;
  }
  if (abs < day) {
    const n = Math.round(abs / hour);
    return `${futurePrefix}${n} hr${n === 1 ? "" : "s"}${suffix}`;
  }
  if (abs < 30 * day) {
    const n = Math.round(abs / day);
    return `${futurePrefix}${n} day${n === 1 ? "" : "s"}${suffix}`;
  }
  return formatDateTime(d);
}
