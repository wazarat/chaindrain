import type { ExposureEntityDetail } from "@/lib/db/queries";
import {
  cn,
  formatDate,
  formatNumber,
  formatRiskScore,
  formatUsdCompact,
  riskScoreColor,
  riskTierClass,
} from "@/lib/utils";
import { DemoChip } from "./demo-chip";

interface FieldProps {
  label: string;
  value: string | null | undefined;
  confidence?: string | null;
}

function Field({ label, value, confidence }: FieldProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="flex items-baseline">
        <span className="text-sm">{value ?? "—"}</span>
        {confidence ? <DemoChip confidence={confidence} /> : null}
      </div>
    </div>
  );
}

function ArrayField({
  label,
  values,
  confidence,
}: {
  label: string;
  values: string[] | null | undefined;
  confidence?: string | null;
}) {
  const text =
    values && values.length > 0
      ? values.join(", ")
      : null;
  return <Field label={label} value={text} confidence={confidence} />;
}

interface ExposureProfileProps {
  entity: ExposureEntityDetail;
}

export function ExposureProfile({ entity }: ExposureProfileProps) {
  const sections: Array<{
    title: string;
    fields: React.ReactNode;
  }> = [
    {
      title: "Identity",
      fields: (
        <>
          <Field label="Sector" value={entity.sector} />
          <ArrayField
            label="Subsector tags"
            values={entity.subsector_tags}
            confidence="DEMO"
          />
          <ArrayField
            label="Chain deployments"
            values={entity.chain_deployments}
          />
          <Field
            label="Website"
            value={entity.website_canonical ?? entity.website}
            confidence={entity.website_canonical ? "DEMO" : null}
          />
          <Field label="Launch date" value={formatDate(entity.launch_date)} />
          <Field
            label="Immutable"
            value={
              entity.is_immutable_bool == null
                ? entity.is_immutable
                : entity.is_immutable_bool
                  ? "yes"
                  : "no"
            }
            confidence={entity.is_immutable_bool != null ? "DEMO" : null}
          />
          <Field
            label="Permissionless"
            value={
              entity.is_permissionless_bool == null
                ? entity.is_permissionless
                : entity.is_permissionless_bool
                  ? "yes"
                  : "no"
            }
            confidence={entity.is_permissionless_bool != null ? "DEMO" : null}
          />
        </>
      ),
    },
    {
      title: "Contract",
      fields: (
        <>
          <Field
            label="Primary address"
            value={entity.primary_contract_address}
          />
          <Field label="Proxy pattern" value={entity.proxy_pattern} />
          <Field
            label="Upgrade authority"
            value={entity.upgrade_authority_type}
          />
          <Field
            label="Multisig threshold"
            value={
              entity.multisig_threshold != null
                ? String(entity.multisig_threshold)
                : null
            }
          />
          <Field label="Compiler" value={entity.compiler_version} />
          <Field
            label="Uses assembly"
            value={
              entity.uses_assembly_bool == null
                ? entity.uses_assembly == null
                  ? null
                  : entity.uses_assembly
                    ? "yes"
                    : "no"
                : entity.uses_assembly_bool
                  ? "yes"
                  : "no"
            }
            confidence={entity.uses_assembly_bool != null ? "DEMO" : null}
          />
          <Field
            label="Bug bounty"
            value={
              entity.bug_bounty_program_enum ?? entity.bug_bounty_program
            }
            confidence={entity.bug_bounty_program_enum ? "DEMO" : null}
          />
          <ArrayField
            label="Contract addresses"
            values={entity.contract_addresses}
            confidence="DEMO"
          />
          <Field
            label="Audits tier"
            value={entity.audits_tier != null ? String(entity.audits_tier) : null}
          />
        </>
      ),
    },
    {
      title: "Dependency",
      fields: (
        <>
          <ArrayField
            label="Oracle providers"
            values={entity.oracle_providers}
          />
          <ArrayField
            label="Bridge dependencies"
            values={entity.bridge_dependencies}
          />
          <ArrayField
            label="Stablecoin dependencies"
            values={entity.stablecoin_dependencies}
          />
          <ArrayField
            label="LST / LRT deps"
            values={entity.lst_lrt_dependencies}
            confidence={entity.lst_lrt_confidence}
          />
          <ArrayField
            label="DEX liquidity venues"
            values={entity.dex_liquidity_venues}
            confidence={entity.dex_liquidity_venues_confidence}
          />
          <ArrayField
            label="CEX listings"
            values={entity.cex_listings}
            confidence={entity.cex_listings_confidence}
          />
          <Field
            label="Custodian"
            value={entity.custodian}
            confidence={entity.custodian_confidence}
          />
          <Field
            label="KMS provider"
            value={entity.kms_provider}
            confidence={entity.kms_provider_confidence}
          />
          <Field
            label="RPC provider"
            value={entity.rpc_provider_primary}
            confidence={entity.rpc_provider_primary_confidence}
          />
          <Field
            label="Frontend host"
            value={entity.frontend_host}
            confidence={entity.frontend_host_confidence}
          />
          <Field
            label="npm lockfile sha"
            value={entity.npm_lockfile_sha}
            confidence={entity.npm_lockfile_sha_confidence}
          />
        </>
      ),
    },
    {
      title: "Governance",
      fields: (
        <>
          <Field
            label="Governance type"
            value={entity.governance_type}
            confidence={entity.governance_confidence}
          />
          <Field
            label="Governance token"
            value={entity.governance_token_address}
            confidence={entity.governance_confidence}
          />
          <Field
            label="Treasury size"
            value={formatUsdCompact(entity.treasury_size_usd)}
            confidence={entity.governance_confidence}
          />
          <Field
            label="Team size"
            value={
              entity.team_size_estimate != null
                ? formatNumber(entity.team_size_estimate)
                : null
            }
            confidence={entity.governance_confidence}
          />
          <Field
            label="Jurisdiction"
            value={entity.team_jurisdiction}
            confidence={entity.governance_confidence}
          />
          <Field
            label="Incorporated entity"
            value={entity.incorporated_entity}
            confidence={entity.governance_confidence}
          />
          <Field
            label="Anonymous team"
            value={
              entity.is_anonymous_team == null
                ? null
                : entity.is_anonymous_team
                  ? "yes"
                  : "no"
            }
            confidence={entity.governance_confidence}
          />
          <Field
            label="Security disclosure"
            value={
              entity.has_security_disclosure_policy == null
                ? null
                : entity.has_security_disclosure_policy
                  ? "yes"
                  : "no"
            }
            confidence={entity.governance_confidence}
          />
          <Field
            label="IR SLA (hours)"
            value={
              entity.incident_response_sla_hours != null
                ? String(entity.incident_response_sla_hours)
                : null
            }
            confidence={entity.governance_confidence}
          />
        </>
      ),
    },
    {
      title: "Reputation",
      fields: (
        <>
          <Field
            label="GitHub"
            value={entity.github_repo_url}
            confidence={entity.reputation_confidence}
          />
          <Field
            label="Commit velocity (30d)"
            value={
              entity.github_commit_velocity_30d != null
                ? formatNumber(entity.github_commit_velocity_30d)
                : null
            }
            confidence={entity.reputation_confidence}
          />
          <Field
            label="Contributors"
            value={
              entity.github_contributor_count != null
                ? formatNumber(entity.github_contributor_count)
                : null
            }
            confidence={entity.reputation_confidence}
          />
          <Field
            label="Twitter"
            value={entity.twitter_handle}
            confidence={entity.reputation_confidence}
          />
          <Field
            label="Discord"
            value={entity.discord_invite}
            confidence={entity.reputation_confidence}
          />
          <Field
            label="Last incident"
            value={formatDate(entity.last_known_incident_date)}
            confidence={entity.reputation_confidence}
          />
          <Field
            label="KYT screening"
            value={entity.kyt_screening_status}
            confidence={entity.reputation_confidence}
          />
        </>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {entity.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {entity.sector ? (
              <span className="text-zinc-500">{entity.sector}</span>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                riskTierClass(entity.risk_tier),
              )}
            >
              {entity.risk_tier ?? "untiered"}
            </span>
            <span className="text-zinc-500">·</span>
            <span className={cn("tabular-nums", riskScoreColor(entity.risk_score))}>
              risk {formatRiskScore(entity.risk_score)}
            </span>
            <span className="text-zinc-500">·</span>
            <span className="tabular-nums">
              TVL {formatUsdCompact(entity.tvl_usd)}
            </span>
            <span className="text-zinc-500">·</span>
            <span className="tabular-nums">
              blast {formatUsdCompact(entity.blast_radius_usd)}
            </span>
            {entity.state ? (
              <>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-700 dark:text-zinc-300">
                  {entity.state}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {entity.website_canonical || entity.website ? (
            <a
              href={entity.website_canonical ?? entity.website ?? "#"}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full bg-zinc-500/10 px-2 py-1 ring-1 ring-zinc-500/20 hover:bg-zinc-500/20"
            >
              website
            </a>
          ) : null}
          {entity.github_repo_url ? (
            <a
              href={entity.github_repo_url}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full bg-zinc-500/10 px-2 py-1 ring-1 ring-zinc-500/20 hover:bg-zinc-500/20"
            >
              github
            </a>
          ) : null}
          {entity.twitter_handle ? (
            <a
              href={`https://twitter.com/${entity.twitter_handle.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full bg-zinc-500/10 px-2 py-1 ring-1 ring-zinc-500/20 hover:bg-zinc-500/20"
            >
              twitter
            </a>
          ) : null}
          {entity.discord_invite ? (
            <a
              href={entity.discord_invite}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full bg-zinc-500/10 px-2 py-1 ring-1 ring-zinc-500/20 hover:bg-zinc-500/20"
            >
              discord
            </a>
          ) : null}
        </div>
      </header>

      <details className="rounded-xl border border-zinc-200 bg-white shadow-sm open:pb-2 dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
          Static profile (Identity / Contract / Dependency / Governance /
          Reputation)
        </summary>
        <div className="grid grid-cols-1 gap-5 px-5 pb-3 pt-1 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => (
            <div key={s.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {s.title}
              </h3>
              <div className="grid grid-cols-1 gap-2">{s.fields}</div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
