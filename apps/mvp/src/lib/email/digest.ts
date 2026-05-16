import type { AffectedEntityRow, AlertRow } from "../db/queries";
import type { AlertSeverity } from "../pollers/types";
import {
  dependencyFieldLabel,
  formatUsdCompact,
  signalTypeLabel,
} from "../utils";

export interface DigestAlertEntry {
  alert: AlertRow;
  topAffected: AffectedEntityRow[];
}

export interface DigestBuckets {
  critical: DigestAlertEntry[];
  high: DigestAlertEntry[];
  medium: DigestAlertEntry[];
  low: DigestAlertEntry[];
}

export interface DigestCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
  counts: DigestCounts;
}

export interface RenderDigestInput {
  windowHours: number;
  generatedAt: Date;
  buckets: DigestBuckets;
  appBaseUrl?: string;
}

const SEVERITY_ORDER: AlertSeverity[] = ["critical", "high", "medium", "low"];

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEVERITY_ACCENT: Record<AlertSeverity, string> = {
  critical: "#b91c1c",
  high: "#c2410c",
  medium: "#a16207",
  low: "#047857",
};

const SEVERITY_BG: Record<AlertSeverity, string> = {
  critical: "#fef2f2",
  high: "#fff7ed",
  medium: "#fefce8",
  low: "#ecfdf5",
};

const DEFAULT_APP_BASE_URL = "https://www.chaindrain.xyz";

export function countBuckets(buckets: DigestBuckets): DigestCounts {
  const critical = buckets.critical.length;
  const high = buckets.high.length;
  const medium = buckets.medium.length;
  const low = buckets.low.length;
  return { critical, high, medium, low, total: critical + high + medium + low };
}

export function digestSubject(counts: DigestCounts): string {
  return `Chaindrain Daily — ${counts.critical} critical / ${counts.high} high alerts`;
}

export function renderDigestEmail(input: RenderDigestInput): RenderedDigest {
  const counts = countBuckets(input.buckets);
  const subject = digestSubject(counts);
  const appBaseUrl = (input.appBaseUrl ?? DEFAULT_APP_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const text = renderText({ ...input, counts, appBaseUrl });
  const html = renderHtml({ ...input, counts, appBaseUrl });
  return { subject, html, text, counts };
}

interface InternalInput extends RenderDigestInput {
  counts: DigestCounts;
  appBaseUrl: string;
}

function describeAlert(entry: DigestAlertEntry) {
  const { alert, topAffected } = entry;
  const fanoutCount = Number(alert.fanout_count ?? 0);
  const fanoutLabel = `${fanoutCount.toLocaleString("en-US")} ${
    fanoutCount === 1 ? "entity" : "entities"
  }`;
  const blast = formatUsdCompact(alert.fanout_tvl_usd as string | number);
  const top = topAffected[0];
  const topName = top?.name ?? null;
  const topBlast = top ? formatUsdCompact(top.blast_radius_usd) : null;
  return {
    fanoutLabel,
    fanoutBlast: blast,
    topName,
    topBlast,
    detected: formatTimestamp(alert.detected_at),
    headline: `${signalTypeLabel(alert.signal_type)} · ${
      alert.dependency_key
    } (${dependencyFieldLabel(alert.dependency_field)})`,
  };
}

function formatTimestamp(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function alertUrl(appBaseUrl: string, alertId: string): string {
  return `${appBaseUrl}/alerts/${encodeURIComponent(alertId)}`;
}

function renderText(input: InternalInput): string {
  const { counts, generatedAt, windowHours, buckets, appBaseUrl } = input;
  const lines: string[] = [];
  lines.push(`Chaindrain Daily Digest`);
  lines.push(
    `Window: last ${windowHours}h · generated ${formatTimestamp(generatedAt)}`,
  );
  lines.push(``);
  lines.push(
    `Totals: ${counts.critical} critical / ${counts.high} high / ${counts.medium} medium / ${counts.low} low`,
  );
  lines.push(``);

  if (counts.total === 0) {
    lines.push(`No alerts in the last ${windowHours}h.`);
    lines.push(``);
    lines.push(`Dashboard: ${appBaseUrl}/`);
    lines.push(`Alerts:    ${appBaseUrl}/alerts`);
    return lines.join("\n");
  }

  for (const severity of SEVERITY_ORDER) {
    const entries = buckets[severity];
    if (entries.length === 0) continue;
    lines.push(`== ${SEVERITY_LABEL[severity]} (${entries.length}) ==`);
    for (const entry of entries) {
      const d = describeAlert(entry);
      lines.push(`- ${d.headline}`);
      lines.push(`  Fanout: ${d.fanoutLabel} · blast radius ${d.fanoutBlast}`);
      lines.push(
        `  Top affected: ${d.topName ? `${d.topName} (${d.topBlast})` : "no affected entities found"}`,
      );
      if (severity === "critical" && entry.topAffected.length > 1) {
        lines.push(`  Top 5 by blast radius:`);
        for (const aff of entry.topAffected.slice(0, 5)) {
          lines.push(
            `    • ${aff.name} — ${formatUsdCompact(aff.blast_radius_usd)}`,
          );
        }
      }
      lines.push(`  Detected: ${d.detected}`);
      lines.push(`  ${alertUrl(appBaseUrl, entry.alert.alert_id)}`);
      lines.push(``);
    }
  }

  lines.push(`Dashboard: ${appBaseUrl}/`);
  lines.push(`All alerts: ${appBaseUrl}/alerts`);
  return lines.join("\n");
}

function renderHtml(input: InternalInput): string {
  const { counts, generatedAt, windowHours, buckets, appBaseUrl } = input;
  const headerSummary = `${counts.critical} critical · ${counts.high} high · ${counts.medium} medium · ${counts.low} low`;
  const sections: string[] = [];

  if (counts.total === 0) {
    sections.push(`
      <p style="margin:24px 0 0;color:#3f3f46;font-size:14px;">
        No alerts in the last ${windowHours}h. The DETECT pollers ran on schedule with no qualifying signals.
      </p>
    `);
  } else {
    for (const severity of SEVERITY_ORDER) {
      const entries = buckets[severity];
      if (entries.length === 0) continue;
      sections.push(renderSeveritySection(severity, entries, appBaseUrl));
    }
  }

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
          <tr>
            <td style="padding:24px 28px 16px;border-bottom:1px solid #e4e4e7;">
              <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Chaindrain · Daily Digest</div>
              <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;color:#18181b;">${escapeHtml(digestSubject(counts))}</h1>
              <div style="margin-top:8px;font-size:13px;color:#52525b;">
                Last ${windowHours}h · ${headerSummary}
              </div>
              <div style="margin-top:4px;font-size:12px;color:#a1a1aa;">
                Generated ${escapeHtml(formatTimestamp(generatedAt))}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 4px;">
              ${sections.join("\n")}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
              <a href="${escapeAttr(appBaseUrl)}/" style="color:#2563eb;text-decoration:none;">Dashboard</a>
              &nbsp;·&nbsp;
              <a href="${escapeAttr(appBaseUrl)}/alerts" style="color:#2563eb;text-decoration:none;">All alerts</a>
              <div style="margin-top:8px;">
                Single-tenant tool · sent because you are listed in DIGEST_RECIPIENTS.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderSeveritySection(
  severity: AlertSeverity,
  entries: DigestAlertEntry[],
  appBaseUrl: string,
): string {
  const accent = SEVERITY_ACCENT[severity];
  const bg = SEVERITY_BG[severity];
  const rows = entries
    .map((entry) => renderAlertRow(entry, severity, appBaseUrl))
    .join("\n");
  return `
    <div style="margin:20px 0 8px;">
      <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${bg};color:${accent};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">
        ${SEVERITY_LABEL[severity]} · ${entries.length}
      </div>
    </div>
    ${rows}
  `;
}

function renderAlertRow(
  entry: DigestAlertEntry,
  severity: AlertSeverity,
  appBaseUrl: string,
): string {
  const d = describeAlert(entry);
  const accent = SEVERITY_ACCENT[severity];
  const expanded =
    severity === "critical" && entry.topAffected.length > 1
      ? `
        <div style="margin-top:8px;font-size:12px;color:#52525b;">Top 5 affected by blast radius:</div>
        <ul style="margin:4px 0 0 18px;padding:0;font-size:13px;color:#27272a;">
          ${entry.topAffected
            .slice(0, 5)
            .map(
              (aff) =>
                `<li style="margin:2px 0;">${escapeHtml(aff.name)} — <span style="color:#52525b;">${escapeHtml(formatUsdCompact(aff.blast_radius_usd))}</span></li>`,
            )
            .join("")}
        </ul>
      `
      : "";
  return `
    <div style="margin:10px 0;padding:14px 16px;border:1px solid #e4e4e7;border-left:3px solid ${accent};border-radius:8px;background:#ffffff;">
      <div style="font-size:14px;font-weight:600;color:#18181b;">${escapeHtml(d.headline)}</div>
      <div style="margin-top:4px;font-size:13px;color:#3f3f46;">Fanout: ${escapeHtml(d.fanoutLabel)} · blast radius <strong>${escapeHtml(d.fanoutBlast)}</strong></div>
      <div style="margin-top:4px;font-size:13px;color:#3f3f46;">Top affected: ${
        d.topName
          ? `<strong>${escapeHtml(d.topName)}</strong> <span style="color:#71717a;">(${escapeHtml(d.topBlast ?? "")})</span>`
          : `<span style="color:#71717a;">no affected entities found</span>`
      }</div>
      ${expanded}
      <div style="margin-top:8px;font-size:11px;color:#71717a;">
        Detected ${escapeHtml(d.detected)}
        &nbsp;·&nbsp;
        <a href="${escapeAttr(alertUrl(appBaseUrl, entry.alert.alert_id))}" style="color:#2563eb;text-decoration:none;">View contagion →</a>
      </div>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
