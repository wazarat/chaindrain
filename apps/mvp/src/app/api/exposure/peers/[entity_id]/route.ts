import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { entityIdParamsSchema } from "@/lib/api/schemas";
import {
  getExposureEntityCached,
  getPeerIncidentsCached,
} from "@/lib/db/queries";
import {
  matchingRootCauses,
  type PredicateEntity,
} from "@/lib/exposure/predicates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ entity_id: string }> },
) {
  try {
    const params = entityIdParamsSchema.parse(await ctx.params);
    const entity = await getExposureEntityCached(params.entity_id);
    if (!entity) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 },
      );
    }

    const predicateEntity: PredicateEntity = {
      entity_id: entity.entity_id,
      name: entity.name,
      sector: entity.sector,
      tvl_usd: entity.tvl_usd ? Number(entity.tvl_usd) : null,
      oracle_providers: entity.oracle_providers ?? null,
      bridge_dependencies: entity.bridge_dependencies ?? null,
      stablecoin_dependencies: entity.stablecoin_dependencies ?? null,
      chain_deployments: entity.chain_deployments ?? null,
      upgrade_authority_type: entity.upgrade_authority_type ?? null,
      multisig_threshold: entity.multisig_threshold ?? null,
      audits_tier: entity.audits_tier ?? null,
      dvn_configuration: entity.dvn_configuration ?? null,
      frontend_host: entity.frontend_host ?? null,
      npm_lockfile_sha: entity.npm_lockfile_sha ?? null,
      kms_provider: entity.kms_provider ?? null,
      is_anonymous_team: entity.is_anonymous_team ?? null,
      team_jurisdiction: entity.team_jurisdiction ?? null,
      has_security_disclosure_policy:
        entity.has_security_disclosure_policy ?? null,
      governance_type: entity.governance_type ?? null,
    };

    const rootCauses = matchingRootCauses(predicateEntity);
    const groups = await getPeerIncidentsCached(params.entity_id, rootCauses);

    return NextResponse.json({
      ok: true,
      data: {
        matched_root_causes: rootCauses,
        groups,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "invalid_entity_id", issues: error.issues },
        { status: 400 },
      );
    }
    console.error({ route: "GET /api/exposure/peers/[entity_id]", error });
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
