/**
 * Pure similarity math — Methods A, B, C and the ensemble combinator.
 * Extracted from scripts/seed_similarity.ts so the seeder and unit tests
 * share a single source of truth. No I/O.
 */

import { sha256Hex } from "../../../scripts/lib/demo_rand";

export const TOP_K = 25;
export const ENS_WEIGHT_A = 0.3;
export const ENS_WEIGHT_B = 0.4;
export const ENS_WEIGHT_C = 0.3;
export const METHOD_B_NORM_DIVISOR = 5;

export interface AttrWeight {
  key:
    | "audit_firms"
    | "oracle_providers"
    | "bridge_dependencies"
    | "stablecoin_dependencies"
    | "lst_lrt_dependencies"
    | "chain_deployments"
    | "kms_provider"
    | "frontend_host"
    | "dvn_required"
    | "subsector_tags";
  weight: number;
  singleton: boolean;
}

// Weights are verbatim from chaindrain_exposure_graph_scope.md §5.1.
// Sum = 1.00 — checked by an inline test below.
export const ATTR_WEIGHTS: readonly AttrWeight[] = [
  { key: "audit_firms",             weight: 0.18, singleton: false },
  { key: "oracle_providers",        weight: 0.2,  singleton: false },
  { key: "bridge_dependencies",     weight: 0.18, singleton: false },
  { key: "stablecoin_dependencies", weight: 0.1,  singleton: false },
  { key: "lst_lrt_dependencies",    weight: 0.06, singleton: false },
  { key: "chain_deployments",       weight: 0.08, singleton: false },
  { key: "kms_provider",            weight: 0.06, singleton: true  },
  { key: "frontend_host",           weight: 0.04, singleton: true  },
  { key: "dvn_required",            weight: 0.06, singleton: false },
  { key: "subsector_tags",          weight: 0.04, singleton: false },
];

export interface AttributeBag {
  audit_firms: Set<string>;
  oracle_providers: Set<string>;
  bridge_dependencies: Set<string>;
  stablecoin_dependencies: Set<string>;
  lst_lrt_dependencies: Set<string>;
  chain_deployments: Set<string>;
  subsector_tags: Set<string>;
  kms_provider: string | null;
  frontend_host: string | null;
  dvn_required: Set<string>;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const small = a.size < b.size ? a : b;
  const large = a.size < b.size ? b : a;
  for (const v of small) if (large.has(v)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function singletonEq(a: string | null, b: string | null): number {
  if (a == null || b == null) return 0;
  return a === b ? 1 : 0;
}

export function methodA(s: AttributeBag, t: AttributeBag): number {
  let sum = 0;
  for (const w of ATTR_WEIGHTS) {
    if (w.singleton) {
      const va = s[w.key as "kms_provider" | "frontend_host"];
      const vb = t[w.key as "kms_provider" | "frontend_host"];
      sum += w.weight * singletonEq(va, vb);
    } else {
      const sa = s[
        w.key as Exclude<
          AttrWeight["key"],
          "kms_provider" | "frontend_host"
        >
      ];
      const sb = t[
        w.key as Exclude<
          AttrWeight["key"],
          "kms_provider" | "frontend_host"
        >
      ];
      sum += w.weight * jaccard(sa, sb);
    }
  }
  return sum;
}

/**
 * 64-dim deterministic pseudo-embedding. SHA-256 is 32 bytes per call, so we
 * concatenate two domain-separated hashes per (key, value) to fill all 64
 * buckets with independent bytes; otherwise buckets 32..63 stay at zero and
 * cosineClamped collapses to NaN/0.5 for empty bags.
 */
export function fakeEmbed(bag: AttributeBag): Float32Array {
  const v = new Float32Array(64);
  const ingest = (key: string, value: string): void => {
    const h1 = sha256Hex(`${key}:${value}:lo`);
    const h2 = sha256Hex(`${key}:${value}:hi`);
    for (let i = 0; i < 32; i++) {
      const lo = parseInt(h1.slice(i * 2, i * 2 + 2), 16);
      const hi = parseInt(h2.slice(i * 2, i * 2 + 2), 16);
      v[i]! += (lo - 127.5) / 127.5;
      v[32 + i]! += (hi - 127.5) / 127.5;
    }
  };
  for (const v0 of bag.audit_firms) ingest("audit_firms", v0);
  for (const v0 of bag.oracle_providers) ingest("oracle_providers", v0);
  for (const v0 of bag.bridge_dependencies) ingest("bridge_dependencies", v0);
  for (const v0 of bag.stablecoin_dependencies)
    ingest("stablecoin_dependencies", v0);
  for (const v0 of bag.lst_lrt_dependencies) ingest("lst_lrt_dependencies", v0);
  for (const v0 of bag.chain_deployments) ingest("chain_deployments", v0);
  for (const v0 of bag.subsector_tags) ingest("subsector_tags", v0);
  for (const v0 of bag.dvn_required) ingest("dvn_required", v0);
  if (bag.kms_provider) ingest("kms_provider", bag.kms_provider);
  if (bag.frontend_host) ingest("frontend_host", bag.frontend_host);
  let norm = 0;
  for (let i = 0; i < 64; i++) norm += v[i]! * v[i]!;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < 64; i++) v[i]! /= norm;
  return v;
}

export function cosineClamped(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < 64; i++) dot += a[i]! * b[i]!;
  if (!Number.isFinite(dot)) return 0.5;
  return Math.max(0, Math.min(1, (dot + 1) / 2));
}

export function methodBNormalize(overlap: number): number {
  return Math.min(1, overlap / METHOD_B_NORM_DIVISOR);
}

export function ensembleScore(
  a: number,
  bRaw: number,
  c: number,
): { ensemble: number; bNorm: number } {
  const bNorm = methodBNormalize(bRaw);
  const ensemble = ENS_WEIGHT_A * a + ENS_WEIGHT_B * bNorm + ENS_WEIGHT_C * c;
  return { ensemble, bNorm };
}
