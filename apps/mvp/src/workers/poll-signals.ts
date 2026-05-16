import { pollStablecoinDepeg } from "../lib/pollers/stablecoin-depeg";
import { pollOracleDeviation } from "../lib/pollers/oracle-deviation";
import { pollBridgePause } from "../lib/pollers/bridge-pause";
import { pollAdminTx } from "../lib/pollers/admin-tx";
import { pollTvlDrop } from "../lib/pollers/tvl-drop";
import type { PollerContext, RawAlert } from "../lib/pollers/types";
import {
  computeFanout,
  getTopAdminWatchEntities,
  getWatchedDefillamaSlugs,
  insertAlert,
  type AlertRow,
} from "../lib/db/queries";

export interface PollerOutcome {
  name: string;
  alerts_emitted: number;
  alerts_persisted: number;
  error?: string;
  elapsed_ms: number;
}

export interface PollRunSummary {
  started_at: string;
  finished_at: string;
  elapsed_ms: number;
  pollers: PollerOutcome[];
  alerts: AlertRow[];
}

export const ADMIN_WATCH_LIMIT = 100;

export async function runPollers(
  ctx: PollerContext = makeDefaultContext(),
): Promise<PollRunSummary> {
  const started = ctx.now();

  const [adminEntities, watchedSlugs] = await Promise.all([
    getTopAdminWatchEntities(ADMIN_WATCH_LIMIT).catch((error) => {
      console.error({ pollster: "admin_tx", source: "db", error: String(error) });
      return [];
    }),
    getWatchedDefillamaSlugs().catch((error) => {
      console.error({ pollster: "tvl_drop", source: "db", error: String(error) });
      return [];
    }),
  ]);

  const jobs: Array<{ name: string; run: () => Promise<RawAlert[]> }> = [
    { name: "stablecoin_depeg", run: () => pollStablecoinDepeg(ctx) },
    { name: "oracle_deviation", run: () => pollOracleDeviation(ctx) },
    { name: "bridge_pause", run: () => pollBridgePause(ctx) },
    {
      name: "admin_tx",
      run: () => pollAdminTx(ctx, { entities: adminEntities }),
    },
    {
      name: "tvl_drop",
      run: () => pollTvlDrop(ctx, { watched_slugs: watchedSlugs }),
    },
  ];

  const outcomes: PollerOutcome[] = [];
  const persisted: AlertRow[] = [];

  const settled = await Promise.allSettled(
    jobs.map(async (job) => {
      const jobStart = Date.now();
      try {
        const alerts = await job.run();
        return {
          name: job.name,
          alerts,
          elapsed_ms: Date.now() - jobStart,
        };
      } catch (error) {
        return {
          name: job.name,
          error: error instanceof Error ? error.message : String(error),
          elapsed_ms: Date.now() - jobStart,
        };
      }
    }),
  );

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue;
    }
    const r = result.value;
    if ("error" in r) {
      outcomes.push({
        name: r.name,
        alerts_emitted: 0,
        alerts_persisted: 0,
        error: r.error,
        elapsed_ms: r.elapsed_ms,
      });
      continue;
    }
    const alertsForPoller = r.alerts;
    let savedCount = 0;
    for (const alert of alertsForPoller) {
      try {
        const fanout = await computeFanout(
          alert.dependency_field,
          alert.dependency_key,
        );
        const saved = await insertAlert({
          signal_type: alert.signal_type,
          severity: alert.severity,
          dependency_key: alert.dependency_key,
          dependency_field: alert.dependency_field,
          raw_signal: alert.raw_signal,
          fanout_count: fanout.fanout_count,
          fanout_tvl_usd: fanout.fanout_tvl_usd,
        });
        persisted.push(saved);
        savedCount += 1;
      } catch (error) {
        console.error({
          pollster: r.name,
          alert_key: alert.dependency_key,
          error: String(error),
        });
      }
    }
    outcomes.push({
      name: r.name,
      alerts_emitted: alertsForPoller.length,
      alerts_persisted: savedCount,
      elapsed_ms: r.elapsed_ms,
    });
  }

  const finished = new Date();
  return {
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    elapsed_ms: finished.getTime() - started.getTime(),
    pollers: outcomes,
    alerts: persisted,
  };
}

export function makeDefaultContext(): PollerContext {
  return {
    fetch: fetch,
    now: () => new Date(),
    env: process.env,
  };
}

const isMain =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  /poll-signals\.ts$/.test(process.argv[1]);

if (isMain) {
  void (async () => {
    const summary = await runPollers();
    console.log(JSON.stringify(summary, null, 2));
    const { closeDb } = await import("../lib/db/index");
    await closeDb();
  })();
}
