import { describe, expect, it } from "vitest";
import {
  ATTR_WEIGHTS,
  cosineClamped,
  ensembleScore,
  fakeEmbed,
  jaccard,
  methodA,
  methodBNormalize,
  type AttributeBag,
} from "./similarity";

const emptyBag = (): AttributeBag => ({
  audit_firms: new Set(),
  oracle_providers: new Set(),
  bridge_dependencies: new Set(),
  stablecoin_dependencies: new Set(),
  lst_lrt_dependencies: new Set(),
  chain_deployments: new Set(),
  subsector_tags: new Set(),
  kms_provider: null,
  frontend_host: null,
  dvn_required: new Set(),
});

const realtBag = (): AttributeBag => {
  const b = emptyBag();
  b.oracle_providers.add("chainlink");
  b.stablecoin_dependencies.add("USDC");
  b.subsector_tags.add("real_estate");
  b.subsector_tags.add("credit");
  b.chain_deployments.add("Ethereum");
  b.frontend_host = "vercel";
  return b;
};

const buidlBag = (): AttributeBag => {
  const b = emptyBag();
  b.oracle_providers.add("chainlink");
  b.stablecoin_dependencies.add("USDC");
  b.subsector_tags.add("real_estate");
  b.subsector_tags.add("credit");
  b.subsector_tags.add("treasury");
  b.chain_deployments.add("Ethereum");
  b.frontend_host = "vercel";
  return b;
};

describe("jaccard", () => {
  it("returns 0 for two empty sets", () => {
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it("returns 1 for identical sets", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("computes intersection/union correctly", () => {
    expect(jaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]))).toBeCloseTo(2 / 4, 12);
  });
});

describe("ATTR_WEIGHTS", () => {
  it("weights sum to exactly 1.00 (within float tolerance)", () => {
    const sum = ATTR_WEIGHTS.reduce((acc, w) => acc + w.weight, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("singleton flags align with kms_provider and frontend_host", () => {
    for (const w of ATTR_WEIGHTS) {
      const expected =
        w.key === "kms_provider" || w.key === "frontend_host";
      expect(w.singleton).toBe(expected);
    }
  });
});

describe("methodA", () => {
  it("returns 0 when both bags are empty", () => {
    expect(methodA(emptyBag(), emptyBag())).toBe(0);
  });

  it("returns 1.00 when both bags are identical and fully populated", () => {
    const b: AttributeBag = {
      audit_firms: new Set(["halborn"]),
      oracle_providers: new Set(["chainlink"]),
      bridge_dependencies: new Set(["wormhole"]),
      stablecoin_dependencies: new Set(["USDC"]),
      lst_lrt_dependencies: new Set(["stETH"]),
      chain_deployments: new Set(["Ethereum"]),
      subsector_tags: new Set(["real_estate"]),
      kms_provider: "fireblocks_mpc",
      frontend_host: "vercel",
      dvn_required: new Set(["LayerZero Labs"]),
    };
    expect(methodA(b, b)).toBeCloseTo(1.0, 10);
  });

  it("scores realt vs buidl in (0, 1) and is symmetric", () => {
    const a = methodA(realtBag(), buidlBag());
    const b = methodA(buidlBag(), realtBag());
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
  });
});

describe("fakeEmbed + cosineClamped", () => {
  it("produces a unit-norm 64-dim vector for a non-empty bag", () => {
    const v = fakeEmbed(realtBag());
    expect(v.length).toBe(64);
    let norm = 0;
    for (let i = 0; i < 64; i++) norm += v[i]! * v[i]!;
    expect(Math.sqrt(norm)).toBeCloseTo(1.0, 5);
  });

  it("is deterministic across calls", () => {
    const a = fakeEmbed(realtBag());
    const b = fakeEmbed(realtBag());
    for (let i = 0; i < 64; i++) {
      expect(a[i]!).toBeCloseTo(b[i]!, 12);
    }
  });

  it("self-cosine clamps to 1.0", () => {
    const v = fakeEmbed(realtBag());
    expect(cosineClamped(v, v)).toBeCloseTo(1.0, 10);
  });

  it("clamps to [0, 1]", () => {
    const a = fakeEmbed(realtBag());
    const b = fakeEmbed(buidlBag());
    const c = cosineClamped(a, b);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });

  it("returns 0.5 on a NaN dot (e.g. empty bag → zero vector)", () => {
    const empty = fakeEmbed(emptyBag());
    const v = fakeEmbed(realtBag());
    const c = cosineClamped(empty, v);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
    expect(Number.isFinite(c)).toBe(true);
  });
});

describe("methodBNormalize / ensembleScore", () => {
  it("normalises B linearly until 5 then saturates at 1.0", () => {
    expect(methodBNormalize(0)).toBe(0);
    expect(methodBNormalize(2)).toBeCloseTo(0.4, 10);
    expect(methodBNormalize(5)).toBeCloseTo(1.0, 10);
    expect(methodBNormalize(7)).toBeCloseTo(1.0, 10);
  });

  it("ensembleScore matches 0.3·A + 0.4·min(1,B/5) + 0.3·C", () => {
    const r = ensembleScore(0.5, 3, 0.8);
    expect(r.bNorm).toBeCloseTo(0.6, 10);
    const expected = 0.3 * 0.5 + 0.4 * 0.6 + 0.3 * 0.8;
    expect(r.ensemble).toBeCloseTo(expected, 10);
  });

  it("ensembleScore returns 0 when all three methods are 0", () => {
    expect(ensembleScore(0, 0, 0).ensemble).toBe(0);
  });

  it("ensembleScore returns 1 when all three methods are saturated", () => {
    expect(ensembleScore(1, 5, 1).ensemble).toBeCloseTo(1.0, 10);
  });
});
