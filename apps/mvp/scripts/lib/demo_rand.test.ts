import { describe, expect, it } from "vitest";
import {
  deterministicAddress,
  intInRange,
  logNormalLoss,
  mulberry32,
  pick,
  pickN,
  seedFromEntityId,
  sha256Hex,
  triangularDate,
  weighted,
} from "./demo_rand";

const E1 = "11111111-1111-4111-8111-111111111111";
const E2 = "22222222-2222-4222-8222-222222222222";

describe("seedFromEntityId", () => {
  it("returns the same number for the same entity_id across calls", () => {
    expect(seedFromEntityId(E1)).toBe(seedFromEntityId(E1));
  });
  it("returns different numbers for different entity_ids", () => {
    expect(seedFromEntityId(E1)).not.toBe(seedFromEntityId(E2));
  });
});

describe("mulberry32", () => {
  it("produces the same stream for the same seed", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 32; i++) {
      expect(a()).toBeCloseTo(b(), 12);
    }
  });
  it("values lie in [0, 1)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("pick / pickN / weighted (seeder primitives)", () => {
  it("pick is deterministic for the same seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const arr = ["x", "y", "z", "w"];
    expect(pick(a, arr)).toBe(pick(b, arr));
  });

  it("pickN returns distinct elements without duplication", () => {
    const rng = mulberry32(13);
    const picks = pickN(rng, ["a", "b", "c", "d", "e"], 3);
    expect(new Set(picks).size).toBe(picks.length);
    expect(picks).toHaveLength(3);
  });

  it("weighted respects the relative distribution over many samples", () => {
    const choices: ReadonlyArray<readonly [string, number]> = [
      ["A", 90],
      ["B", 10],
    ];
    const counts: Record<string, number> = { A: 0, B: 0 };
    const rng = mulberry32(99);
    for (let i = 0; i < 2_000; i++) {
      counts[weighted(rng, choices)] = (counts[weighted(rng, choices)] ?? 0) + 1;
    }
    expect(counts.A).toBeGreaterThan(counts.B);
  });
});

describe("intInRange", () => {
  it("respects inclusive min/max bounds", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const v = intInRange(rng, 5, 9);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});

describe("sha256Hex / deterministicAddress", () => {
  it("sha256Hex is stable", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
  });
  it("deterministicAddress produces well-formed 0x-prefixed 20-byte hex", () => {
    const addr = deterministicAddress("seed:1");
    expect(addr).toMatch(/^0x[0-9a-f]{40}$/);
  });
});

describe("triangularDate", () => {
  it("returns the same date for the same seed and bounds", () => {
    const r1 = mulberry32(seedFromEntityId(E1));
    const r2 = mulberry32(seedFromEntityId(E1));
    const a = triangularDate(r1, "2020-01-01", "2025-12-31", "2024-06-01");
    const b = triangularDate(r2, "2020-01-01", "2025-12-31", "2024-06-01");
    expect(a).toBe(b);
  });

  it("returns a date within the bounds", () => {
    const r = mulberry32(123);
    const d = triangularDate(r, "2020-01-01", "2025-12-31", "2024-06-01");
    const t = new Date(d).getTime();
    expect(t).toBeGreaterThanOrEqual(new Date("2020-01-01").getTime());
    expect(t).toBeLessThanOrEqual(new Date("2025-12-31").getTime());
  });
});

describe("logNormalLoss", () => {
  it("returns a non-negative integer within the requested range", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = logNormalLoss(rng, 50_000, 5_000_000);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(50_000);
      expect(v).toBeLessThanOrEqual(5_000_000);
    }
  });
});
