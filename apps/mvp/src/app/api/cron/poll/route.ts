import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { runPollers } from "@/workers/poll-signals";
import { CACHE_TAG_ALERTS, CACHE_TAG_KPIS } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "cron_secret_not_configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const summary = await runPollers();
    const persistedCount = summary.pollers.reduce(
      (acc, p) => acc + p.alerts_persisted,
      0,
    );
    if (persistedCount > 0) {
      revalidateTag(CACHE_TAG_ALERTS, "max");
      revalidateTag(CACHE_TAG_KPIS, "max");
    }
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error({ route: "cron/poll", error: String(error) });
    return NextResponse.json(
      { ok: false, error: "poll_failed", message: String(error) },
      { status: 500 },
    );
  }
}

export const POST = GET;
