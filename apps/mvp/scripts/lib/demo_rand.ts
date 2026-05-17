import { createHash } from "node:crypto";

export function seedFromEntityId(entityId: string): number {
  const hex = entityId.replace(/-/g, "").slice(0, 8);
  return parseInt(hex, 16) >>> 0;
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error("pick: empty array");
  }
  return arr[Math.floor(rng() * arr.length)] as T;
}

export function pickN<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const c = [...arr];
  const out: T[] = [];
  const take = Math.max(0, Math.min(n, c.length));
  for (let i = 0; i < take; i++) {
    const idx = Math.floor(rng() * c.length);
    out.push(c.splice(idx, 1)[0] as T);
  }
  return out;
}

export type Weighted<T> = readonly [T, number];

export function weighted<T>(rng: () => number, choices: readonly Weighted<T>[]): T {
  if (choices.length === 0) {
    throw new Error("weighted: empty choices");
  }
  const total = choices.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) {
    return choices[choices.length - 1]![0];
  }
  let r = rng() * total;
  for (const [v, w] of choices) {
    r -= Math.max(0, w);
    if (r <= 0) return v;
  }
  return choices[choices.length - 1]![0];
}

export function intInRange(
  rng: () => number,
  lo: number,
  hi: number,
): number {
  const a = Math.ceil(Math.min(lo, hi));
  const b = Math.floor(Math.max(lo, hi));
  return a + Math.floor(rng() * (b - a + 1));
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function deterministicAddress(seed: string): string {
  return "0x" + sha256Hex(seed).slice(0, 40);
}

export function deterministicTxHash(seed: string): string {
  return "0x" + sha256Hex(seed).slice(0, 64);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "entity";
}

export function triangularDate(
  rng: () => number,
  isoStart: string,
  isoPeak: string,
  isoEnd: string,
): string {
  const start = new Date(isoStart).getTime();
  const peak = new Date(isoPeak).getTime();
  const end = new Date(isoEnd).getTime();
  const u = rng();
  const f = (peak - start) / (end - start);
  let t: number;
  if (u < f) {
    t = start + Math.sqrt(u * (end - start) * (peak - start));
  } else {
    t = end - Math.sqrt((1 - u) * (end - start) * (end - peak));
  }
  const d = new Date(Math.round(t));
  return d.toISOString().slice(0, 10);
}

export function logNormalLoss(
  rng: () => number,
  minUsd: number,
  maxUsd: number,
): number {
  const lnLo = Math.log(Math.max(1, minUsd));
  const lnHi = Math.log(Math.max(minUsd + 1, maxUsd));
  const x = lnLo + rng() * (lnHi - lnLo);
  return Math.round(Math.exp(x));
}
