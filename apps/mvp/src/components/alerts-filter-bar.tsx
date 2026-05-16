"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";
import { X } from "lucide-react";
import { MultiSelect } from "./multi-select";
import { buildSearchString, parseList } from "@/lib/url-state";
import { cn, signalTypeLabel } from "@/lib/utils";
import {
  SEVERITIES,
  SIGNAL_TYPES,
} from "@/lib/api/schemas";

const SIGNAL_OPTIONS = SIGNAL_TYPES.map((id) => ({ id, label: signalTypeLabel(id) }));
const SEVERITY_OPTIONS = SEVERITIES.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

const WINDOW_OPTIONS = [
  { value: "1", label: "Last 24h" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

interface AlertsFilterBarProps {
  windowDays: number;
}

export function AlertsFilterBar({ windowDays }: AlertsFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = useMemo(() => {
    return {
      signalTypes: parseList(searchParams.get("signalTypes")),
      severities: parseList(searchParams.get("severities")),
      windowDays: searchParams.get("windowDays") ?? String(windowDays),
    };
  }, [searchParams, windowDays]);

  function pushParams(next: Record<string, string | string[] | undefined>) {
    const merged: Record<string, string | string[] | undefined> = {
      signalTypes: current.signalTypes,
      severities: current.severities,
      windowDays: current.windowDays,
      sort: searchParams.get("sort") ?? undefined,
      direction: searchParams.get("direction") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      page: "1",
      ...next,
    };
    const qs = buildSearchString(merged);
    startTransition(() => {
      router.push(`/alerts${qs}`, { scroll: false });
    });
  }

  function setFilter(key: string, value: string[]) {
    pushParams({ [key]: value.length > 0 ? value : undefined });
  }

  function setWindow(value: string) {
    pushParams({ windowDays: value });
  }

  function clearAll() {
    startTransition(() => {
      router.push("/alerts", { scroll: false });
    });
  }

  const hasAnyFilter =
    current.signalTypes.length > 0 ||
    current.severities.length > 0 ||
    current.windowDays !== "7";

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        pending && "opacity-80",
      )}
    >
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
          Filters
        </h2>
        {hasAnyFilter ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Time window
          </label>
          <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
            {WINDOW_OPTIONS.map((opt) => {
              const isActive = current.windowDays === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWindow(opt.value)}
                  className={cn(
                    "rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <MultiSelect
          label="Signal type"
          options={SIGNAL_OPTIONS.map((o) => o.id)}
          values={current.signalTypes}
          onChange={(v) => setFilter("signalTypes", v)}
        />
        <MultiSelect
          label="Severity"
          options={SEVERITY_OPTIONS.map((o) => o.id)}
          values={current.severities}
          onChange={(v) => setFilter("severities", v)}
        />
      </div>
    </div>
  );
}
