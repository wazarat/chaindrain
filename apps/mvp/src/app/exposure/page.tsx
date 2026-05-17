import { Suspense } from "react";
import {
  getExposureKpisCached,
  listExposureEntitiesCached,
} from "@/lib/db/queries";
import { exposureQuerySchema } from "@/lib/api/schemas";
import { SiteHeader } from "@/components/site-header";
import { DemoBanner } from "@/components/demo-banner";
import { ExposureKpiCards } from "@/components/exposure-kpi-cards";
import { ExposureTable } from "@/components/exposure-table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExposureIndexPage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const flat: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (value === undefined) continue;
    flat[key] = value;
  }
  const parsed = exposureQuerySchema.safeParse(flat);
  const params = parsed.success ? parsed.data : exposureQuerySchema.parse({});

  const [kpis, list] = await Promise.all([
    getExposureKpisCached(),
    listExposureEntitiesCached({
      filters: {
        sectors: params.sectors,
        riskTiers: params.riskTiers,
        coverageTiers: params.coverageTiers,
        hasIncidentHistory: params.hasIncidentHistory,
        rootCauseExposure: params.rootCauseExposure,
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
      <SiteHeader active="exposure" />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Exposure Graph
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Three-panel dependency, peer-incident, and twin similarity view for{" "}
          {kpis.entities_mapped.toLocaleString()} tracked entities. Click any row
          to open the per-entity detail.
        </p>
      </div>

      <DemoBanner />

      <ExposureKpiCards kpis={kpis} />

      <Suspense fallback={null}>
        <ExposureTable
          rows={list.rows}
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          totalPages={totalPages}
          sort={params.sort}
          direction={params.direction}
        />
      </Suspense>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        <span>
          Universe:{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            chaindrain.mvp_master_dedup
          </code>{" "}
          · Incidents:{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            chaindrain.incident
          </code>{" "}
          · Twins:{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            chaindrain.similarity_pair
          </code>
        </span>
        <a
          href="/methodology#exposure-graph"
          className="hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          /methodology#exposure-graph
        </a>
      </footer>
    </div>
  );
}
