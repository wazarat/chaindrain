import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { AlertRow } from "@/lib/db/queries";
import {
  cn,
  dependencyFieldLabel,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  formatUsdCompact,
  severityClass,
  signalTypeLabel,
} from "@/lib/utils";

interface AlertHeaderProps {
  alert: AlertRow;
}

export function AlertHeader({ alert }: AlertHeaderProps) {
  const json = JSON.stringify(alert.raw_signal, null, 2);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <Link
          href="/alerts"
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to alerts
        </Link>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
                  severityClass(alert.severity),
                )}
              >
                {alert.severity}
              </span>
              <span className="text-xs uppercase tracking-wider text-zinc-500">
                {signalTypeLabel(alert.signal_type)}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {alert.dependency_key}{" "}
              <span className="text-base font-normal text-zinc-500">
                {dependencyFieldLabel(alert.dependency_field)}
              </span>
            </h1>
            <p
              className="text-sm text-zinc-500"
              title={formatDateTime(alert.detected_at)}
            >
              Detected {formatRelativeTime(alert.detected_at)} ·{" "}
              {formatDateTime(alert.detected_at)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Stat
              label="Fanout count"
              value={formatNumber(alert.fanout_count)}
            />
            <Stat
              label="Blast radius"
              value={formatUsdCompact(alert.fanout_tvl_usd)}
            />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Raw signal
          </h3>
          <pre className="max-h-72 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            {json}
          </pre>
          <p className="mt-2 text-xs text-zinc-500">
            <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
              alert_id={alert.alert_id}
            </code>
          </p>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
