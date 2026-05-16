"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import type { AlertRow, AlertSortField } from "@/lib/db/queries";
import {
  cn,
  dependencyFieldLabel,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  formatUsdCompact,
  severityClass,
  signalTypeLabel,
} from "@/lib/utils";
import { buildSearchString } from "@/lib/url-state";

interface AlertsTableProps {
  rows: AlertRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: AlertSortField;
  direction: "asc" | "desc";
  windowDays: number;
}

const COLUMNS: Array<{
  field: AlertSortField | null;
  label: string;
  align?: "right";
}> = [
  { field: "detected_at", label: "Detected" },
  { field: "severity", label: "Severity" },
  { field: null, label: "Signal" },
  { field: null, label: "Dependency" },
  { field: "fanout_count", label: "Fanout", align: "right" },
  { field: "fanout_tvl_usd", label: "Blast radius", align: "right" },
  { field: null, label: "" },
];

export function AlertsTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  direction,
  windowDays,
}: AlertsTableProps) {
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
        router.push(`/alerts${qs}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  function onSort(field: AlertSortField) {
    let nextDirection: "asc" | "desc" = "desc";
    if (field === sort) {
      nextDirection = direction === "desc" ? "asc" : "desc";
    }
    navigate({ sort: field, direction: nextDirection, page: "1" });
  }

  function onPageChange(nextPage: number) {
    navigate({ page: String(nextPage) });
  }

  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);
  const windowLabel =
    windowDays === 1 ? "last 24h" : `last ${windowDays} days`;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          {total === 0 ? (
            <span>No alerts in the {windowLabel}.</span>
          ) : (
            <span>
              Showing{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {startIdx.toLocaleString()}–{endIdx.toLocaleString()}
              </span>{" "}
              of{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {total.toLocaleString()}
              </span>{" "}
              alerts ({windowLabel})
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-500">
          Sorted by{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {sort}
          </span>{" "}
          {direction === "desc" ? "↓" : "↑"}
        </div>
      </div>

      <div className={cn("overflow-x-auto", pending && "opacity-70")}>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-400">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.label || "actions"}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-3 py-2.5 font-medium",
                    col.align === "right" && "text-right",
                  )}
                >
                  {col.field ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.field as AlertSortField)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100",
                        sort === col.field &&
                          "text-zinc-900 dark:text-zinc-100",
                      )}
                    >
                      <span>{col.label}</span>
                      {sort === col.field ? (
                        direction === "desc" ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUp className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    <span>{col.label}</span>
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
                  className="px-3 py-16 text-center text-sm text-zinc-500"
                >
                  No alerts in the selected window or matching the current
                  filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.alert_id}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                >
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Link
                      href={`/alerts/${row.alert_id}`}
                      className="block text-zinc-900 dark:text-zinc-100"
                      title={formatDateTime(row.detected_at)}
                    >
                      <span className="font-medium">
                        {formatRelativeTime(row.detected_at)}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {formatDateTime(row.detected_at)}
                      </span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        severityClass(row.severity),
                      )}
                    >
                      {row.severity}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-zinc-700 dark:text-zinc-300">
                    {signalTypeLabel(row.signal_type)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {row.dependency_key}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {dependencyFieldLabel(row.dependency_field)}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatNumber(row.fanout_count)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatUsdCompact(row.fanout_tvl_usd)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/alerts/${row.alert_id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      View
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={onPageChange}
        disabled={pending}
      />
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
  disabled,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled: boolean;
}) {
  if (totalPages <= 1) return null;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">
        Page{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          {page}
        </span>{" "}
        of {totalPages}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={!canPrev || disabled}
          className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={!canNext || disabled}
          className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Next
        </button>
      </div>
    </div>
  );
}
