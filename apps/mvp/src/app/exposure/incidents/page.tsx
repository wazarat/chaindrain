import { Suspense } from "react";
import { incidentsQuerySchema } from "@/lib/api/schemas";
import { listIncidentsCached } from "@/lib/db/queries";
import { SiteHeader } from "@/components/site-header";
import { DemoBanner } from "@/components/demo-banner";
import { IncidentsTable } from "@/components/incidents-table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function IncidentsLedgerPage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const flat: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (value === undefined) continue;
    flat[key] = value;
  }
  const parsed = incidentsQuerySchema.safeParse(flat);
  const params = parsed.success ? parsed.data : incidentsQuerySchema.parse({});

  const result = await listIncidentsCached({
    rootCauses: params.rootCauses,
    attribution: params.attribution,
    attackLayer: params.attackLayer,
    year: params.year,
    minLossUsd: params.minLossUsd,
    sortField: params.sort,
    sortDirection: params.direction,
    page: params.page,
    pageSize: params.pageSize,
  });

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <SiteHeader active="exposure" />
      <DemoBanner />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Incident Ledger
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Flat list of all recorded incidents. Click a row for full detail with
          AADAPT mappings and post-mortem links.
        </p>
      </div>

      <Suspense fallback={null}>
        <IncidentsTable
          rows={result.rows}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={totalPages}
          sort={params.sort}
          direction={params.direction}
        />
      </Suspense>
    </div>
  );
}
