import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { cn, riskTierClass, severityClass } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Methodology — Chaindrain",
  description:
    "How Chaindrain computes risk tiers, what metrics we collect, and which live signals drive alerts.",
};

export const runtime = "nodejs";

interface RiskTierBand {
  tier: "critical" | "high" | "medium" | "low";
  label: string;
  range: string;
  count: number;
  description: string;
}

const TIER_BANDS: RiskTierBand[] = [
  {
    tier: "critical",
    label: "Critical",
    range: "≥ 0.65",
    count: 59,
    description:
      "High-TVL protocols with mutable code, weak audit coverage, or limited bug-bounty programs. The daily agent watches these closely; every dependency degradation produces a fan-out alert.",
  },
  {
    tier: "high",
    label: "High",
    range: "0.50 – 0.65",
    count: 69,
    description:
      "Material exposure but at least one offsetting control (mature audits, sizeable bounty, or immutable core). Worth monitoring; alerts when paired with high blast radius.",
  },
  {
    tier: "medium",
    label: "Medium",
    range: "0.30 – 0.50",
    count: 705,
    description:
      "The long tail — lower TVL or strong defensive posture. Alerts only fire when a signal directly references one of these entities or a shared dependency.",
  },
  {
    tier: "low",
    label: "Low",
    range: "< 0.30",
    count: 42,
    description:
      "Immutable, well-audited, low-TVL, or well-bountied. Background watch — no proactive alerts.",
  },
];

interface FormulaFactor {
  name: string;
  weight: string;
  formula: string;
  rationale: string;
}

const FORMULA_FACTORS: FormulaFactor[] = [
  {
    name: "TVL factor",
    weight: "0.4",
    formula: "log10(tvl_usd) normalized to 0–1",
    rationale:
      "Bigger pool = bigger target. Empirically the dominant variable in historical exploit selection.",
  },
  {
    name: "Mutability factor",
    weight: "0.3",
    formula:
      "1.0 if proxy + EOA admin · 0.7 if proxy + contract admin · 0.3 if proxy + multisig · 0.0 if immutable",
    rationale:
      "Mutable code means a larger attack surface (admin key compromise) and a faster un-detected silent change.",
  },
  {
    name: "Audit factor",
    weight: "0.2",
    formula: "Inverse of DefiLlama audits_tier (0–5); 1.0 if tier 0/unknown, 0.0 if tier 5",
    rationale:
      "Strongly correlated with exploit rate in historical data. No tier ≈ no public assurance.",
  },
  {
    name: "Bounty factor",
    weight: "0.1",
    formula: "Inverse log of bug_bounty_max_payout_usd",
    rationale:
      "Protocols with no/small bounties get fewer whitehat reports → more zero-days reach prod.",
  },
];

interface MetricGroup {
  table: string;
  intent: string;
  fields: Array<{ name: string; why: string }>;
}

const METRIC_GROUPS: MetricGroup[] = [
  {
    table: "Identity",
    intent: "Who the entity is and where it lives.",
    fields: [
      { name: "name", why: "Canonical brand label, deduplicated across sub-products." },
      { name: "sector", why: "Primary business category — drives default coverage tier." },
      { name: "chain_deployments", why: "Cross-chain footprint; feeds chain-wide contagion alerts." },
      { name: "tvl_usd", why: "Direct input to the risk score; first-order indicator of exploit attractiveness." },
      { name: "defillama_slug", why: "Join key for live TVL polling (24h delta drives the tvl_drop signal)." },
      { name: "launch_date", why: "Age proxy — newer protocols carry higher unknown-unknown risk." },
    ],
  },
  {
    table: "Contract Fingerprint",
    intent: "How the code can change and who can change it.",
    fields: [
      { name: "proxy_pattern", why: "Transparent / UUPS / immutable — feeds the mutability factor." },
      { name: "upgrade_authority_type", why: "EOA vs multisig vs DAO — defines the silent-upgrade attack surface." },
      { name: "admin_address", why: "Watched directly via Etherscan for live admin transactions." },
      { name: "audits_tier", why: "DefiLlama 0–5 audit grade; feeds the audit factor." },
      { name: "audit_firms", why: "Reputation signal beyond raw count; reused for similar-exposure clustering." },
      { name: "bug_bounty_max_payout_usd", why: "Quantitative bounty program strength; feeds the bounty factor." },
    ],
  },
  {
    table: "Dependency Fingerprint",
    intent: "What this entity is exposed to — the contagion vectors.",
    fields: [
      { name: "oracle_providers", why: "Largest historical DeFi exploit class. Single-feed staleness fans out instantly." },
      { name: "bridge_dependencies", why: "$2.8B+ stolen via bridges 2022–2024; mapped per top entity." },
      { name: "stablecoin_dependencies", why: "USDC March 2023 / UST May 2022 — depeg propagates through this graph." },
      { name: "dvn_configuration", why: "LayerZero V2 trust assumption made explicit; surfaces 1-to-1 DVN risk." },
    ],
  },
  {
    table: "Tier State (computed)",
    intent: "Outputs of the scoring leg, refreshed daily.",
    fields: [
      { name: "risk_score", why: "0–1 weighted composite. The number that ranks the dashboard." },
      { name: "risk_tier", why: "Bucketed risk_score — critical / high / medium / low." },
      { name: "coverage_tier", why: "How aggressively we watch — core / monitored / archive / excluded." },
      { name: "blast_radius_usd", why: "Estimated downstream exposure; the dollar-weighted fan-out impact." },
      { name: "state", why: "Live operational status — active / degraded / paused / exploited / wound_down." },
    ],
  },
];

interface SignalRow {
  type: "stablecoin_depeg" | "oracle_deviation" | "bridge_pause" | "admin_tx" | "tvl_drop";
  label: string;
  source: string;
  thresholds: string;
  severity: "critical" | "high" | "medium";
  why: string;
}

const SIGNALS: SignalRow[] = [
  {
    type: "stablecoin_depeg",
    label: "Stablecoin depeg",
    source: "CoinGecko /simple/price (USDC, USDT, DAI, FDUSD, USDS, USDe, USD0)",
    thresholds: "±0.5% deviation = high · ±2% = critical",
    severity: "critical",
    why: "Depeg events propagate through every protocol holding the affected reserve.",
  },
  {
    type: "oracle_deviation",
    label: "Oracle deviation",
    source: "Chainlink + Pyth ETH/BTC/LINK feeds vs. CoinGecko reference",
    thresholds: "1% = medium · 5% = high",
    severity: "high",
    why: "Stale or manipulated price feeds caused Mango ($117M), Inverse ($15.6M), bZx ($55M).",
  },
  {
    type: "bridge_pause",
    label: "Bridge pause",
    source: "LayerZero V2 paused() · Wormhole guardian heartbeat · Axelar maintainers",
    thresholds:
      "LayerZero paused = critical · Wormhole guardians <13 = critical · Axelar maintainers <3 = critical",
    severity: "critical",
    why: "Bridges are the single largest historical theft vector ($2.8B+ since 2022).",
  },
  {
    type: "admin_tx",
    label: "Admin transaction",
    source: "Etherscan txlist on the top 100 admin addresses by risk_score",
    thresholds: "EOA / multisig admin tx in last 5 min = high · contract admin = medium",
    severity: "high",
    why: "Surfaces silent code-swap upgrades and ownership transfers in near-real time.",
  },
  {
    type: "tvl_drop",
    label: "TVL drop",
    source: "DefiLlama /protocols change_1d",
    thresholds: "−20% 24h = high · −40% = critical",
    severity: "critical",
    why: "First public sign of an exploit, run, or governance failure for any protocol with a slug.",
  },
];

const VALUE_PROPS: Array<{ title: string; body: string }> = [
  {
    title: "Prioritized watchlist",
    body: "775 deduplicated companies ranked by a transparent risk score so the daily agent watches 50 closely instead of 875 evenly.",
  },
  {
    title: "Instant fan-out",
    body: "When a dependency degrades — oracle, bridge, stablecoin, admin, or TVL — Chaindrain shows every entity exposed to that exact dependency, ordered by blast radius in USD.",
  },
  {
    title: "Daily digest at 09:00 UTC",
    body: "Every alert from the previous 24 hours, bucketed by severity, with the top affected entities inline. Empty windows are silent — no noise.",
  },
];

export default function MethodologyPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <SiteHeader active="methodology" />

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Methodology
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          A transparent, no-ML risk model. This page documents how each tier is
          computed, what we collect, what we detect, and how that turns into
          alerts you can act on.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          1. How risk tiers are calculated
        </h2>
        <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Every entity is scored once per day and bucketed into one of four
          tiers. Bands are calibrated against the live distribution across all
          tracked companies.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {TIER_BANDS.map((band) => (
            <div
              key={band.tier}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                    riskTierClass(band.tier),
                  )}
                >
                  {band.label}
                </span>
                <span className="text-xs tabular-nums text-zinc-500">
                  {band.range} · {band.count.toLocaleString()} entities
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                {band.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          2. The risk-score formula
        </h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Weighted linear composite. Weights are published, not learned —
            they were chosen as defensible priors and will be backtested once
            the Incident Ledger lands.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg bg-zinc-50 px-4 py-3 font-mono text-sm text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            risk_score = 0.4 · tvl + 0.3 · mutability + 0.2 · audit + 0.1 · bounty
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {FORMULA_FACTORS.map((factor) => (
            <div
              key={factor.name}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {factor.name}
                </h3>
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  weight {factor.weight}
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">{factor.formula}</p>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                {factor.rationale}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          3. What we collect
        </h2>
        <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Four tables, one row per company, joined on{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
            entity_id
          </code>
          . Every field has an explicit reason to exist — anything that could
          not justify the maintenance cost was deferred.
        </p>
        <div className="grid gap-4">
          {METRIC_GROUPS.map((group) => (
            <div
              key={group.table}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {group.table}
                </h3>
                <span className="text-xs text-zinc-500">{group.intent}</span>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <li
                    key={f.name}
                    className="flex flex-col gap-0.5 rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950"
                  >
                    <code className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      {f.name}
                    </code>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {f.why}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          4. What we detect
        </h2>
        <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Five live signal pollers run on a regular cadence. Each emits an
          alert with a severity and a fan-out — the list of every other entity
          that depends on the same key.
        </p>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2.5 font-medium">Signal</th>
                <th className="px-3 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Thresholds</th>
                <th className="px-3 py-2.5 font-medium">Why it matters</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {SIGNALS.map((s) => (
                <tr key={s.type} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {s.label}
                      </span>
                      <span
                        className={cn(
                          "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                          severityClass(s.severity),
                        )}
                      >
                        {s.severity}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                    {s.source}
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                    {s.thresholds}
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {s.why}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          5. How this helps you
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {VALUE_PROPS.map((v) => (
            <div
              key={v.title}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {v.title}
              </h3>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                {v.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex items-center justify-between border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        <span>
          Source views:{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            chaindrain.mvp_master_dedup
          </code>{" "}
          ·{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            chaindrain.alert
          </code>
        </span>
      </footer>
    </div>
  );
}
