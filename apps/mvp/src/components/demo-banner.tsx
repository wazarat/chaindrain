import { Info } from "lucide-react";

/**
 * Persistent disclosure banner shown on every /exposure/* page.
 * Copy is verbatim from chaindrain_exposure_graph_scope.md §0.
 */
export function DemoBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-200"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="leading-relaxed">
        <span className="font-medium">Preview surface — demo data.</span>{" "}
        Where real data exists today (e.g. RealT, BlackRock BUIDL, Lift Dollar)
        we render it; everywhere else we render synthetic enrichment generated
        deterministically from public signal and clearly marked{" "}
        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium uppercase tracking-wider ring-1 ring-amber-500/40">
          Demo
        </span>{" "}
        or{" "}
        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium uppercase tracking-wider ring-1 ring-amber-500/40">
          Inferred
        </span>
        . The Phase 3 roadmap replaces every synthetic source with live
        ingestion — see{" "}
        <a
          href="/methodology#exposure-graph"
          className="font-medium underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
        >
          Methodology → Exposure Graph &amp; Similarity Engine
        </a>
        .
      </div>
    </div>
  );
}
