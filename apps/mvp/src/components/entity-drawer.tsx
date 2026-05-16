"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, X } from "lucide-react";
import type { EntityDetail } from "@/lib/db/queries";
import {
  cn,
  coverageTierClass,
  formatDate,
  formatNumber,
  formatRiskScore,
  formatUsdFull,
  riskScoreColor,
  riskTierClass,
} from "@/lib/utils";

interface EntityDrawerProps {
  entityId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function EntityDrawer({ entityId, onOpenChange }: EntityDrawerProps) {
  const open = entityId !== null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-zinc-900/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col overflow-hidden border-l border-zinc-200 bg-white shadow-2xl outline-none dark:border-zinc-800 dark:bg-zinc-950"
          aria-describedby={undefined}
        >
          {entityId ? (
            <DrawerInner key={entityId} entityId={entityId} />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DrawerInner({ entityId }: { entityId: string }) {
  const [data, setData] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/entities/${entityId}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        setData(json.data as EntityDetail);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : String(err ?? "unknown");
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <Dialog.Title className="truncate text-xl font-semibold tracking-tight">
            {data?.name ?? (loading ? "Loading…" : "Entity")}
          </Dialog.Title>
          <Dialog.Description className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
            {data?.sector ?? entityId}
          </Dialog.Description>
        </div>
        <Dialog.Close
          className="-mr-2 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </Dialog.Close>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && !data ? (
          <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
            Loading entity detail…
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            Failed to load: {error}
          </div>
        ) : data ? (
          <EntityBody data={data} />
        ) : null}
      </div>
    </>
  );
}

function EntityBody({ data }: { data: EntityDetail }) {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Risk score"
          value={formatRiskScore(data.risk_score)}
          valueClass={riskScoreColor(data.risk_score)}
        />
        <Stat
          label="Risk tier"
          custom={
            <Pill className={riskTierClass(data.risk_tier)}>
              {data.risk_tier ?? "—"}
            </Pill>
          }
        />
        <Stat
          label="Coverage"
          custom={
            <Pill className={coverageTierClass(data.coverage_tier)}>
              {data.coverage_tier ?? "—"}
            </Pill>
          }
        />
        <Stat label="State" value={data.state ?? "—"} />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="TVL" value={formatUsdFull(data.tvl_usd)} />
        <Stat
          label="Blast radius"
          value={formatUsdFull(data.blast_radius_usd)}
        />
        <Stat
          label="Bug bounty (max)"
          value={formatUsdFull(data.bug_bounty_max_payout_usd)}
        />
        <Stat label="Audits tier" value={formatNumber(data.audits_tier)} />
      </section>

      <Section title="Identity">
        <KV k="Entity ID" v={<code className="text-xs">{data.entity_id}</code>} />
        <KV
          k="Website"
          v={
            data.website ? (
              <a
                href={data.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                {data.website}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              "—"
            )
          }
        />
        <KV k="Sector" v={data.sector ?? "—"} />
        <KV
          k="Chains"
          v={<Chips items={asArray(data.chain_deployments)} />}
        />
        <KV k="Launch date" v={formatDate(data.launch_date)} />
        <KV k="Immutable" v={data.is_immutable ?? "—"} />
        <KV k="Permissionless" v={data.is_permissionless ?? "—"} />
        <KV k="DefiLlama slug" v={data.defillama_slug ?? "—"} />
        <KV k="CoinGecko id" v={data.coingecko_id ?? "—"} />
      </Section>

      <Section title="Contract fingerprint">
        <KV
          k="Primary contract"
          v={
            <code className="text-xs break-all">
              {data.primary_contract_address ?? "—"}
            </code>
          }
        />
        <KV
          k="Implementation"
          v={
            <code className="text-xs break-all">
              {data.implementation_address ?? "—"}
            </code>
          }
        />
        <KV k="Proxy pattern" v={data.proxy_pattern ?? "—"} />
        <KV
          k="Upgrade authority"
          v={data.upgrade_authority_type ?? "—"}
        />
        <KV
          k="Admin address"
          v={
            <code className="text-xs break-all">
              {data.admin_address ?? "—"}
            </code>
          }
        />
        <KV
          k="Multisig threshold"
          v={formatNumber(data.multisig_threshold)}
        />
        <KV
          k="Timelock (h)"
          v={formatNumber(data.timelock_delay_hours)}
        />
        <KV k="Compiler" v={data.compiler_version ?? "—"} />
        <KV
          k="Verified source"
          v={data.verified_source === null ? "—" : String(data.verified_source)}
        />
        <KV
          k="Uses assembly"
          v={data.uses_assembly === null ? "—" : String(data.uses_assembly)}
        />
        <KV
          k="External calls"
          v={formatNumber(data.external_call_count)}
        />
      </Section>

      <Section title="Audits & bounties">
        <KV
          k="Audits tier"
          v={formatNumber(data.audits_tier)}
        />
        <KV
          k="Audit firms"
          v={<Chips items={asArray(data.audit_firms)} />}
        />
        <KV k="Last audit" v={formatDate(data.last_audit_date)} />
        <KV
          k="Audit links"
          v={data.audit_links ?? "—"}
        />
        <KV k="Bug bounty program" v={data.bug_bounty_program ?? "—"} />
        <KV
          k="Bug bounty max payout"
          v={formatUsdFull(data.bug_bounty_max_payout_usd)}
        />
        <KV
          k="Immunefi URL"
          v={
            data.bug_bounty_immunefi_url ? (
              <a
                href={data.bug_bounty_immunefi_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                Immunefi
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              "—"
            )
          }
        />
      </Section>

      <Section title="Dependencies">
        <KV
          k="Oracle providers"
          v={<Chips items={asArray(data.oracle_providers)} />}
        />
        <KV
          k="Oracle confidence"
          v={data.oracle_confidence ?? "—"}
        />
        <KV
          k="Bridges"
          v={<Chips items={asArray(data.bridge_dependencies)} />}
        />
        <KV
          k="Bridge confidence"
          v={data.bridge_confidence ?? "—"}
        />
        <KV
          k="Stablecoins"
          v={<Chips items={asArray(data.stablecoin_dependencies)} />}
        />
        <KV
          k="Stablecoin confidence"
          v={data.stablecoin_confidence ?? "—"}
        />
        <KV
          k="DVN configuration"
          v={data.dvn_configuration ?? "—"}
        />
        <KV k="DVN confidence" v={data.dvn_confidence ?? "—"} />
        <KV
          k="Dependency sources"
          v={data.dependency_sources ?? "—"}
        />
      </Section>

      <Section title="Risk factors">
        <KV k="Risk score" v={formatRiskScore(data.risk_score)} />
        <KV k="TVL factor" v={formatRiskScore(data.tvl_factor)} />
        <KV
          k="Mutability factor"
          v={formatRiskScore(data.mutability_factor)}
        />
        <KV k="Audit factor" v={formatRiskScore(data.audit_factor)} />
        <KV k="Bounty factor" v={formatRiskScore(data.bounty_factor)} />
        <KV
          k="Last state change"
          v={formatDate(data.last_state_change)}
        />
      </Section>
    </div>
  );
}

function asArray(value: string[] | string | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [String(value)];
}

function Stat({
  label,
  value,
  valueClass,
  custom,
}: {
  label: string;
  value?: string;
  valueClass?: string;
  custom?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      {custom ? (
        <div className="mt-1">{custom}</div>
      ) : (
        <div className={cn("mt-1 text-base", valueClass)}>{value}</div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
        {title}
      </h3>
      <dl className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {children}
      </dl>
    </section>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 px-3 py-2 text-sm">
      <dt className="col-span-1 text-zinc-500 dark:text-zinc-400">{k}</dt>
      <dd className="col-span-2 break-words text-zinc-900 dark:text-zinc-100">
        {v}
      </dd>
    </div>
  );
}

function Pill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Chips({ items }: { items: string[] }) {
  if (!items || items.length === 0) return <span className="text-zinc-500">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
