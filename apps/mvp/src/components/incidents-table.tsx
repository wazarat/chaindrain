"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { IncidentRow } from "@/lib/db/queries";
import { cn, formatDate, formatNumber, formatUsdCompact } from "@/lib/utils";
import { buildSearchString } from "@/lib/url-state";
import { DemoChip } from "./demo-chip";

type SortField = "event_date" | "loss_amount_usd" | "root_cause";

interface IncidentsTableProps {
  rows: (IncidentRow & { victim_names: string[] })[];
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
  { field: "event_date", label: "Date" },
  { field: null, label: "Victim(s)" },
  { field: "root_cause", label: "Root cause" },
  { field: null, label: "Attack layer" },
  { field: null, label: "Attribution" },
  { field: "loss_amount_usd", label: "Loss", align: "right" },
];

export function IncidentsTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  direction,
}: IncidentsTableProps) {
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
        router.push(`/exposure/incidents${qs}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  const toggleSort = (field: SortField) => {
    const isActive = sort === field;
    const nextDirection = isActive && direction === "desc" ? "asc" : "desc";
    navigate({ sort: field, direction: nextDirection, page: "1" });
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
                  No incidents match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((inc) => (
                <tr
                  key={inc.incident_id}
                  className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  onClick={() =>
                    router.push(`/exposure/incidents/${inc.incident_id}`, {
                      scroll: true,
                    })
                  }
                >
                  <td className="px-4 py-3 tabular-nums">
                    {formatDate(inc.event_date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-1">
                      <span className="font-medium">
                        {inc.victim_names.slice(0, 2).join(", ")}
                        {inc.victim_names.length > 2
                          ? ` +${inc.victim_names.length - 2}`
                          : ""}
                      </span>
                      <DemoChip confidence={inc.data_confidence} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {inc.root_cause.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {inc.attack_layer
                      ? inc.attack_layer.replace(/_/g, " ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {inc.attacker_attribution ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400">
                    {formatUsdCompact(inc.loss_amount_usd)}
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
