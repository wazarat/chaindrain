export type AlertSignalType =
  | "stablecoin_depeg"
  | "oracle_deviation"
  | "bridge_pause"
  | "admin_tx"
  | "tvl_drop";

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export type DependencyField =
  | "stablecoin_dependencies"
  | "oracle_providers"
  | "bridge_dependencies"
  | "chain_deployments"
  | "admin_address"
  | "defillama_slug";

export const ARRAY_DEPENDENCY_FIELDS: ReadonlySet<DependencyField> = new Set([
  "stablecoin_dependencies",
  "oracle_providers",
  "bridge_dependencies",
  "chain_deployments",
]);

export interface RawAlert {
  signal_type: AlertSignalType;
  severity: AlertSeverity;
  dependency_key: string;
  dependency_field: DependencyField;
  raw_signal: Record<string, unknown>;
}

export interface PollerContext {
  fetch: typeof fetch;
  now: () => Date;
  env: NodeJS.ProcessEnv;
}

export interface PollerResult {
  name: string;
  alerts: RawAlert[];
  error?: string;
  elapsed_ms: number;
}

export type PollerFn = (ctx: PollerContext) => Promise<RawAlert[]>;
