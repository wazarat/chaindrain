"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ExposureEntityRow } from "@/lib/db/queries";
import {
  cn,
  formatNumber,
  formatRiskScore,
  formatUsdCompact,
  riskScoreColor,
  riskTierClass,
} from "@/lib/utils";
import { buildSearchString } from "@/lib/url-state";

type SortField =
  | "name"
  | "sector"
  | "risk_score"
  | "tvl_usd"
  | "blast_radius_usd"
  | "historical_incidents"
  | "top_twin_score";

interface ExposureTableProps {
  rows: ExposureEntityRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: SortField;
  direction: "asc" | "desc";
}

const COLUMNS: Array<{
  field: SortField | null;
  label: string;
  align?: "right";
}> = [
  { field: "name", label: "Name" },
  { field: "sector", label: "Sector" },
  { field: "tvl_usd", label: "TVL", align: "right" },
  { field: "risk_score", label: "Risk score", align: "right" },
  { field: null, label: "Tier" },
  { field: null, label: "Top dependency twin" },
  { field: "historical_incidents", label: "Incidents", align: "right" },
  { field: null, label: "State" },
];

export function ExposureTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  direction,
}: ExposureTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const navigate = useCallback(
    (next: Record<string, string | undefined>) => {
      const merged: Record<string, string | string[] | undefined> = {};
      searchParams.forEach((value, key) => {
        merged[key] = value;
      });
      Object.assign(merged, next);
      const qs = buildSearchString(merged);
      startTransition(() => {
        router.push(`/exposure${qs}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  const toggleSort = (field: SortField) => {
    const isActive = sort === field;
    const nextDirection = isActive && direction === "desc" ? "asc" : "desc";
    navigate({
      sort: field,
      direction: nextDirection,
      page: "1",
    });
  };

  const sortIcon = (field: SortField) => {
    if (sort !== field) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return direction === "asc" ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        pending && "opacity-70",
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className={cn(
                    "px-4 py-3 font-medium",
                    col.align === "right" && "text-right",
                  )}
                >
                  {col.field ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.field as SortField)}
                      className={cn(
                        "inline-flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-zinc-200",
                        col.align === "right" && "ml-auto",
                      )}
                    >
                      {col.label}
                      {sortIcon(col.field as SortField)}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No entities match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.entity_id}
                  className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  onClick={() =>
                    router.push(`/exposure/${row.entity_id}`, { scroll: true })
                  }
                >
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {row.sector ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatUsdCompact(row.tvl_usd)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      riskScoreColor(row.risk_score),
                    )}
                  >
                    {formatRiskScore(row.risk_score)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        riskTierClass(row.risk_tier),
                      )}
                    >
                      {row.risk_tier ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.top_twin_entity_id && row.top_twin_name ? (
                      <Link
                        href={`/exposure/${row.top_twin_entity_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-500/30 hover:bg-teal-500/20 dark:text-teal-300"
                      >
                        {row.top_twin_name}
                        <span className="tabular-nums opacity-70">
                          {row.top_twin_ensemble
                            ? Number(row.top_twin_ensemble).toFixed(2)
                            : "—"}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.historical_incidents > 0 ? (
                      <Link
                        href={`/exposure/${row.entity_id}#threat-history`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-red-600 hover:underline dark:text-red-400"
                      >
                        {formatNumber(row.historical_incidents)}
                      </Link>
                    ) : (
                      <span className="text-zinc-500">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {row.state ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <span>
          Showing {formatNumber(start)}–{formatNumber(end)} of{" "}
          {formatNumber(total)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || pending}
            onClick={() => navigate({ page: String(page - 1) })}
            className="rounded-md border border-zinc-200 px-2 py-1 disabled:opacity-50 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Previous
          </button>
          <span className="tabular-nums">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || pending}
            onClick={() => navigate({ page: String(page + 1) })}
            className="rounded-md border border-zinc-200 px-2 py-1 disabled:opacity-50 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
