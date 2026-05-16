import type { AffectedEntityRow, DependencyField } from "@/lib/db/queries";
import {
  cn,
  dependencyFieldLabel,
  formatRiskScore,
  formatUsdCompact,
  riskScoreColor,
  riskTierClass,
} from "@/lib/utils";

interface AffectedEntitiesTableProps {
  rows: AffectedEntityRow[];
  dependencyField: DependencyField;
  dependencyKey: string;
}

const ARRAY_FIELD_TO_COLUMN: Record<string, keyof AffectedEntityRow | null> = {
  stablecoin_dependencies: "stablecoin_dependencies",
  oracle_providers: "oracle_providers",
  bridge_dependencies: "bridge_dependencies",
  chain_deployments: "chain_deployments",
  admin_address: "admin_address",
  defillama_slug: "defillama_slug",
};

export function AffectedEntitiesTable({
  rows,
  dependencyField,
  dependencyKey,
}: AffectedEntitiesTableProps) {
  const sourceColumn = ARRAY_FIELD_TO_COLUMN[dependencyField] ?? null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Affected entities
          </h2>
          <p className="text-xs text-zinc-500">
            {rows.length === 0
              ? "No entities in the catalog match this dependency."
              : `${rows.length.toLocaleString()} ${
                  rows.length === 1 ? "entity depends" : "entities depend"
                } on this ${dependencyFieldLabel(dependencyField).toLowerCase()} — ordered by blast radius.`}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-500/30 dark:bg-red-500/20 dark:text-red-300">
          {dependencyFieldLabel(dependencyField)}: {dependencyKey}
        </span>
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
                TVL
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                Risk score
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                Tier
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                Matching dependency
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
                  No matching entities.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const matchingMembers = collectMatchingMembers(
                  row,
                  sourceColumn,
                  dependencyKey,
                );
                return (
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
                    <td className="px-3 py-2.5">
                      <DependencyChips
                        items={matchingMembers}
                        highlightedKey={dependencyKey}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatUsdCompact(row.blast_radius_usd)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function collectMatchingMembers(
  row: AffectedEntityRow,
  sourceColumn: keyof AffectedEntityRow | null,
  highlightedKey: string,
): string[] {
  if (sourceColumn === null) return [highlightedKey];
  const value = row[sourceColumn];
  if (value === null || value === undefined) return [highlightedKey];
  if (Array.isArray(value)) {
    return value.length > 0 ? value : [highlightedKey];
  }
  return [String(value)];
}

function DependencyChips({
  items,
  highlightedKey,
}: {
  items: string[];
  highlightedKey: string;
}) {
  if (!items || items.length === 0) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => {
        const isHighlighted = item === highlightedKey;
        return (
          <span
            key={item}
            className={cn(
              "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs",
              isHighlighted
                ? "bg-red-500/15 text-red-700 ring-1 ring-red-500/30 dark:bg-red-500/20 dark:text-red-300"
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
            )}
          >
            {item}
          </span>
        );
      })}
    </div>
  );
}
