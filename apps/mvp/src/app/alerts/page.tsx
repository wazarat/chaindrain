import { Suspense } from "react";
import { listAlertsCached } from "@/lib/db/queries";
import { alertsQuerySchema } from "@/lib/api/schemas";
import { AlertsFilterBar } from "@/components/alerts-filter-bar";
import { AlertsTable } from "@/components/alerts-table";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AlertsIndexPage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const flat: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (value === undefined) continue;
    flat[key] = value;
  }
  const parsed = alertsQuerySchema.safeParse(flat);
  const params = parsed.success ? parsed.data : alertsQuerySchema.parse({});

  const list = await listAlertsCached({
    windowDays: params.windowDays,
    signalTypes: params.signalTypes,
    severities: params.severities,
    sortField: params.sort,
    sortDirection: params.direction,
    page: params.page,
    pageSize: params.pageSize,
  });

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <SiteHeader active="alerts" legSubtitle="FAN OUT leg · MVP" />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Alerts
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Detection signals from the last {params.windowDays} day
          {params.windowDays === 1 ? "" : "s"}. Click any alert to see affected
          entities and similar exposure.
        </p>
      </div>

      <Suspense fallback={null}>
        <AlertsFilterBar windowDays={params.windowDays} />
      </Suspense>

      <Suspense fallback={null}>
        <AlertsTable
          rows={list.rows}
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          totalPages={totalPages}
          sort={params.sort}
          direction={params.direction}
          windowDays={params.windowDays}
        />
      </Suspense>

      <footer className="flex items-center justify-between border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        <span>
          Data:{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            chaindrain.alert
          </code>
          {" · "}
          poller schedule:{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            */5 * * * *
          </code>{" "}
          (GitHub Actions)
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
