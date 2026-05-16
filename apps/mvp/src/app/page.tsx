import { Suspense } from "react";
import {
  getEntities,
  getFilterOptions,
  getKpiSummary,
} from "@/lib/db/queries";
import { entitiesQuerySchema } from "@/lib/api/schemas";
import { KpiCards } from "@/components/kpi-cards";
import { FilterBar } from "@/components/filter-bar";
import { EntitiesTable } from "@/components/entities-table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const flat: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (value === undefined) continue;
    flat[key] = value;
  }
  const parsed = entitiesQuerySchema.safeParse(flat);
  const params = parsed.success
    ? parsed.data
    : entitiesQuerySchema.parse({});

  const [kpis, options, list] = await Promise.all([
    getKpiSummary(),
    getFilterOptions(),
    getEntities({
      filters: {
        sectors: params.sectors,
        riskTiers: params.riskTiers,
        coverageTiers: params.coverageTiers,
        oracles: params.oracles,
        chains: params.chains,
        bridges: params.bridges,
        search: params.search,
      },
      sortField: params.sort,
      sortDirection: params.direction,
      page: params.page,
      pageSize: params.pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-white dark:bg-white dark:text-zinc-900">
            Chaindrain
          </span>
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            SCORE leg · MVP
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Risk dashboard
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Predictive threat detection across {kpis.total_entities.toLocaleString()}{" "}
          tracked crypto protocols. Click any row for full entity detail.
        </p>
      </header>

      <KpiCards kpis={kpis} />

      <Suspense fallback={null}>
        <FilterBar options={options} />
      </Suspense>

      <Suspense fallback={null}>
        <EntitiesTable
          rows={list.rows}
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          totalPages={totalPages}
          sort={params.sort}
          direction={params.direction}
        />
      </Suspense>

      <footer className="flex items-center justify-between border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        <span>
          Data:{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            chaindrain.mvp_master
          </code>
        </span>
        <a
          href="/api/health"
          className="hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          /api/health
        </a>
      </footer>
    </div>
  );
}
