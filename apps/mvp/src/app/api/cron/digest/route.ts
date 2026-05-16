import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  getAffectedEntities,
  listAlerts,
  type AlertRow,
} from "@/lib/db/queries";
import type { AlertSeverity } from "@/lib/pollers/types";
import {
  countBuckets,
  renderDigestEmail,
  type DigestAlertEntry,
  type DigestBuckets,
} from "@/lib/email/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_FROM = "Chaindrain Alerts <onboarding@resend.dev>";
const WINDOW_HOURS = 24;
const WINDOW_DAYS = 1;
const TOP_AFFECTED_LIMIT = 5;
const SEVERITY_ORDER: AlertSeverity[] = ["critical", "high", "medium", "low"];

function parseRecipients(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function buildBuckets(alerts: AlertRow[]): Promise<DigestBuckets> {
  const buckets: DigestBuckets = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };

  const entries: DigestAlertEntry[] = await Promise.all(
    alerts.map(async (alert) => {
      try {
        const topAffected = await getAffectedEntities(
          alert.dependency_field,
          alert.dependency_key,
          { limit: TOP_AFFECTED_LIMIT },
        );
        return { alert, topAffected };
      } catch (error) {
        console.error({
          route: "cron/digest",
          subop: "top_affected",
          alert_id: alert.alert_id,
          error: String(error),
        });
        return { alert, topAffected: [] };
      }
    }),
  );

  for (const entry of entries) {
    const sev = entry.alert.severity as AlertSeverity;
    if (SEVERITY_ORDER.includes(sev)) {
      buckets[sev].push(entry);
    }
  }
  return buckets;
}

export async function GET(request: Request) {
  const startedAt = Date.now();

  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "cron_secret_not_configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length)
    : "";
  if (provided !== expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipients = parseRecipients(process.env.DIGEST_RECIPIENTS);
  if (!apiKey || recipients.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "digest_not_configured",
        message: !apiKey
          ? "RESEND_API_KEY is not set"
          : "DIGEST_RECIPIENTS is not set",
      },
      { status: 500 },
    );
  }

  try {
    const { rows: alerts } = await listAlerts({
      windowDays: WINDOW_DAYS,
      sortField: "severity",
      sortDirection: "asc",
      page: 1,
      pageSize: 200,
    });

    const buckets = await buildBuckets(alerts);
    const counts = countBuckets(buckets);

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    if (counts.total === 0 && !force) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "no_alerts",
        window_hours: WINDOW_HOURS,
        counts,
        elapsed_ms: Date.now() - startedAt,
      });
    }

    const generatedAt = new Date();
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
    const rendered = renderDigestEmail({
      windowHours: WINDOW_HOURS,
      generatedAt,
      buckets,
      appBaseUrl: appBaseUrl && appBaseUrl.length > 0 ? appBaseUrl : undefined,
    });

    const from = process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
    const resend = new Resend(apiKey);
    const sendResult = await resend.emails.send({
      from,
      to: recipients,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (sendResult.error) {
      console.error({
        route: "cron/digest",
        subop: "resend_send",
        error: sendResult.error,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "resend_send_failed",
          message: sendResult.error.message,
          name: sendResult.error.name,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      window_hours: WINDOW_HOURS,
      counts,
      subject: rendered.subject,
      recipients,
      message_id: sendResult.data?.id ?? null,
      from,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error({ route: "cron/digest", error: String(error) });
    return NextResponse.json(
      {
        ok: false,
        error: "digest_failed",
        message: String(error),
        elapsed_ms: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

export const POST = GET;
