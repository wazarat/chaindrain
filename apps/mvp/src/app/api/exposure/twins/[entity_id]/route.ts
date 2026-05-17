import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { entityIdParamsSchema } from "@/lib/api/schemas";
import { getDependencyTwinsCached } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(
  request: Request,
  ctx: { params: Promise<{ entity_id: string }> },
) {
  try {
    const params = entityIdParamsSchema.parse(await ctx.params);
    const url = new URL(request.url);
    const { limit } = querySchema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const rows = await getDependencyTwinsCached(params.entity_id, { limit });
    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "invalid_request", issues: error.issues },
        { status: 400 },
      );
    }
    console.error({ route: "GET /api/exposure/twins/[entity_id]", error });
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
