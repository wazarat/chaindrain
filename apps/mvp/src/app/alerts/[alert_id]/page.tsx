import { notFound } from "next/navigation";
import {
  defaultSimilarVia,
  getAffectedEntities,
  getAlertById,
  getSimilarExposure,
} from "@/lib/db/queries";
import { alertIdParamsSchema } from "@/lib/api/schemas";
import { AffectedEntitiesTable } from "@/components/affected-entities-table";
import { AlertHeader } from "@/components/alert-header";
import { SimilarExposurePanel } from "@/components/similar-exposure-panel";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ alert_id: string }>;
}

export default async function AlertDetailPage({ params }: PageProps) {
  const rawParams = await params;
  const parsed = alertIdParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    notFound();
  }
  const alertId = parsed.data.alert_id;

  const alert = await getAlertById(alertId);
  if (!alert) {
    notFound();
  }

  const similarVia = defaultSimilarVia(alert.dependency_field);

  const [affected, similar] = await Promise.all([
    getAffectedEntities(alert.dependency_field, alert.dependency_key, {
      limit: 200,
    }),
    getSimilarExposure(alert.dependency_field, alert.dependency_key, {
      similarVia,
      limit: 10,
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <SiteHeader active="alerts" legSubtitle="FAN OUT leg · MVP" />

      <AlertHeader alert={alert} />

      <AffectedEntitiesTable
        rows={affected}
        dependencyField={alert.dependency_field}
        dependencyKey={alert.dependency_key}
      />

      <SimilarExposurePanel
        rows={similar}
        similarVia={similarVia}
        dependencyKey={alert.dependency_key}
      />

      <footer className="flex items-center justify-between border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        <span>
          Affected query:{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            chaindrain.mvp_master
          </code>{" "}
          · similar exposure via{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            {similarVia}
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
