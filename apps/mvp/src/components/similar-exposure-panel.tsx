import type {
  SimilarExposureField,
  SimilarExposureRow,
} from "@/lib/db/queries";
import {
  cn,
  dependencyFieldLabel,
  formatRiskScore,
  formatUsdCompact,
  riskScoreColor,
  riskTierClass,
} from "@/lib/utils";

interface SimilarExposurePanelProps {
  rows: SimilarExposureRow[];
  similarVia: SimilarExposureField;
  dependencyKey: string;
}

export function SimilarExposurePanel({
  rows,
  similarVia,
  dependencyKey,
}: SimilarExposurePanelProps) {
  const viaLabel = dependencyFieldLabel(similarVia).toLowerCase();

  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
          Similar exposure
        </h2>
        <p className="text-xs text-zinc-500">
          Top {rows.length || 10} entities <em>not</em> exposed to{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {dependencyKey}
          </span>{" "}
          directly, ranked by shared {viaLabel} overlap with the affected set
          (Method B).
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-400">
            <tr>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                Name
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                Sector
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                Risk
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                Tier
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                Shared {viaLabel}
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                Overlap
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                Blast radius
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-zinc-500"
                >
                  No comparable entities found via {viaLabel} overlap.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.entity_id}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                    {row.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                    {row.sector ?? "—"}
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
                  <td className="px-3 py-2.5">
                    <OverlapChips items={row.overlap_members} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                    {row.overlap_score}
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
    </section>
  );
}

function OverlapChips({ items }: { items: string[] }) {
  if (!items || items.length === 0)
    return <span className="text-xs text-zinc-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-800 ring-1 ring-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
