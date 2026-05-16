"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { EntityRow } from "@/lib/db/queries";
import {
  cn,
  coverageTierClass,
  formatRiskScore,
  formatUsdCompact,
  riskScoreColor,
  riskTierClass,
} from "@/lib/utils";
import { buildSearchString } from "@/lib/url-state";
import { EntityDrawer } from "./entity-drawer";

type SortField =
  | "risk_score"
  | "tvl_usd"
  | "blast_radius_usd"
  | "name"
  | "sector"
  | "risk_tier"
  | "coverage_tier";

interface EntitiesTableProps {
  rows: EntityRow[];
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
  className?: string;
}> = [
  { field: "name", label: "Name" },
  { field: "sector", label: "Sector" },
  { field: "tvl_usd", label: "TVL", align: "right" },
  { field: "risk_score", label: "Risk score", align: "right" },
  { field: "risk_tier", label: "Tier" },
  { field: "coverage_tier", label: "Coverage" },
  { field: null, label: "Oracles" },
  { field: null, label: "Bridges" },
  { field: "blast_radius_usd", label: "Blast radius", align: "right" },
];

export function EntitiesTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  direction,
}: EntitiesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  const navigate = useCallback(
    (next: Record<string, string | undefined>) => {
      const merged: Record<string, string | string[] | undefined> = {};
      searchParams.forEach((value, key) => {
        merged[key] = value;
      });
      Object.assign(merged, next);
      const qs = buildSearchString(merged);
      startTransition(() => {
        router.push(`/${qs}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  function onSort(field: SortField) {
    let nextDirection: "asc" | "desc" = "desc";
    if (field === sort) {
      nextDirection = direction === "desc" ? "asc" : "desc";
    } else if (field === "name" || field === "sector") {
      nextDirection = "asc";
    }
    navigate({
      sort: field,
      direction: nextDirection,
      page: "1",
    });
  }

  function onRowClick(id: string) {
    setOpenId(id);
  }

  function onPageChange(nextPage: number) {
    navigate({ page: String(nextPage) });
  }

  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          {total === 0 ? (
            <span>No matches</span>
          ) : (
            <span>
              Showing <span className="font-medium text-zinc-900 dark:text-zinc-100">{startIdx.toLocaleString()}–{endIdx.toLocaleString()}</span>{" "}
              of <span className="font-medium text-zinc-900 dark:text-zinc-100">{total.toLocaleString()}</span>{" "}
              entities
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
                  key={col.label}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-3 py-2.5 font-medium",
                    col.align === "right" && "text-right",
                  )}
                >
                  {col.field ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.field as SortField)}
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
                  className="px-3 py-12 text-center text-sm text-zinc-500"
                >
                  No entities match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.entity_id}
                  onClick={() => onRowClick(row.entity_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick(row.entity_id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open detail for ${row.name}`}
                  className="cursor-pointer transition-colors hover:bg-zinc-50 focus:bg-zinc-100 focus:outline-none dark:hover:bg-zinc-800/40 dark:focus:bg-zinc-800/60"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                    {row.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                    {row.sector ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatUsdCompact(row.tvl_usd)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-3 py-2.5 text-right tabular-nums",
                      riskScoreColor(row.risk_score),
                    )}
                  >
                    {formatRiskScore(row.risk_score)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        riskTierClass(row.risk_tier),
                      )}
                    >
                      {row.risk_tier ?? "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        coverageTierClass(row.coverage_tier),
                      )}
                    >
                      {row.coverage_tier ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <ChipList items={asArray(row.oracle_providers)} max={2} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ChipList
                      items={asArray(row.bridge_dependencies)}
                      max={2}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatUsdCompact(row.blast_radius_usd)}
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

      <EntityDrawer
        entityId={openId}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      />
    </div>
  );
}

function asArray(value: string[] | string | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [String(value)];
}

function ChipList({ items, max = 3 }: { items: string[]; max?: number }) {
  if (items.length === 0)
    return <span className="text-xs text-zinc-400">—</span>;
  const shown = items.slice(0, max);
  const remaining = items.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((item) => (
        <span
          key={item}
          className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {item}
        </span>
      ))}
      {remaining > 0 ? (
        <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
          +{remaining}
        </span>
      ) : null}
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
        Page <span className="font-medium text-zinc-700 dark:text-zinc-300">{page}</span> of{" "}
        {totalPages}
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
