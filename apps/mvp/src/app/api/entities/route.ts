import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { entitiesQuerySchema, parseSearchParams } from "@/lib/api/schemas";
import { getEntitiesCached } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const raw = parseSearchParams(url.searchParams);
    const params = entitiesQuerySchema.parse(raw);

    const result = await getEntitiesCached({
      filters: {
        sectors: params.sectors,
        riskTiers: params.riskTiers,
        coverageTiers: params.coverageTiers,
        oracles: params.oracles,
        chains: params.chains,
        bridges: params.bridges,
        search: params.search,
      },
      sortField: params.sort,
      sortDirection: params.direction,
      page: params.page,
      pageSize: params.pageSize,
    });

    return NextResponse.json({
      ok: true,
      data: result.rows,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "invalid_query", issues: error.issues },
        { status: 400 },
      );
    }
    console.error({ route: "GET /api/entities", error });
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
