import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { entityIdParamsSchema } from "@/lib/api/schemas";
import { getEntityById } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ entity_id: string }> },
) {
  try {
    const params = entityIdParamsSchema.parse(await ctx.params);
    const entity = await getEntityById(params.entity_id);
    if (!entity) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, data: entity });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "invalid_entity_id", issues: error.issues },
        { status: 400 },
      );
    }
    console.error({ route: "GET /api/entities/[entity_id]", error });
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
