"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import type { FilterOptions } from "@/lib/db/queries";
import { MultiSelect } from "./multi-select";
import { buildSearchString, parseList } from "@/lib/url-state";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  options: FilterOptions;
}

export function FilterBar({ options }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = useMemo(() => {
    return {
      sectors: parseList(searchParams.get("sectors")),
      riskTiers: parseList(searchParams.get("riskTiers")),
      coverageTiers: parseList(searchParams.get("coverageTiers")),
      oracles: parseList(searchParams.get("oracles")),
      chains: parseList(searchParams.get("chains")),
      bridges: parseList(searchParams.get("bridges")),
      search: searchParams.get("search") ?? "",
    };
  }, [searchParams]);

  const [searchInput, setSearchInput] = useState(current.search);
  const [lastUrlSearch, setLastUrlSearch] = useState(current.search);
  if (lastUrlSearch !== current.search) {
    setLastUrlSearch(current.search);
    setSearchInput(current.search);
  }

  function pushParams(next: Record<string, string | string[] | undefined>) {
    const merged: Record<string, string | string[] | undefined> = {
      sectors: current.sectors,
      riskTiers: current.riskTiers,
      coverageTiers: current.coverageTiers,
      oracles: current.oracles,
      chains: current.chains,
      bridges: current.bridges,
      search: current.search || undefined,
      sort: searchParams.get("sort") ?? undefined,
      direction: searchParams.get("direction") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      page: "1",
      ...next,
    };
    const qs = buildSearchString(merged);
    startTransition(() => {
      router.push(`/${qs}`, { scroll: false });
    });
  }

  function setFilter(key: string, value: string[]) {
    pushParams({ [key]: value.length > 0 ? value : undefined });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushParams({ search: searchInput.trim() || undefined });
  }

  function clearAll() {
    setSearchInput("");
    startTransition(() => {
      router.push("/", { scroll: false });
    });
  }

  const hasAnyFilter =
    current.sectors.length > 0 ||
    current.riskTiers.length > 0 ||
    current.coverageTiers.length > 0 ||
    current.oracles.length > 0 ||
    current.chains.length > 0 ||
    current.bridges.length > 0 ||
    current.search.length > 0;

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MultiSelect
          label="Sector"
          options={options.sectors}
          values={current.sectors}
          onChange={(v) => setFilter("sectors", v)}
        />
        <MultiSelect
          label="Risk tier"
          options={options.risk_tiers}
          values={current.riskTiers}
          onChange={(v) => setFilter("riskTiers", v)}
        />
        <MultiSelect
          label="Coverage tier"
          options={options.coverage_tiers}
          values={current.coverageTiers}
          onChange={(v) => setFilter("coverageTiers", v)}
        />
        <MultiSelect
          label="Oracle provider"
          options={options.oracles}
          values={current.oracles}
          onChange={(v) => setFilter("oracles", v)}
        />
        <MultiSelect
          label="Chain"
          options={options.chains}
          values={current.chains}
          onChange={(v) => setFilter("chains", v)}
        />
        <MultiSelect
          label="Bridge"
          options={options.bridges}
          values={current.bridges}
          onChange={(v) => setFilter("bridges", v)}
        />
      </div>

      <form
        onSubmit={submitSearch}
        className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-blue-500"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Apply
        </button>
      </form>
    </div>
  );
}
