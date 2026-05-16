import { describe, expect, it } from "vitest";
import {
  countBuckets,
  digestSubject,
  renderDigestEmail,
  type DigestAlertEntry,
  type DigestBuckets,
} from "./digest";
import type { AffectedEntityRow, AlertRow } from "../db/queries";

function makeAlert(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    alert_id: "11111111-1111-1111-1111-111111111111",
    detected_at: "2026-05-16T09:00:00.000Z",
    signal_type: "stablecoin_depeg",
    severity: "critical",
    dependency_key: "USDC",
    dependency_field: "stablecoin_dependencies",
    raw_signal: { price: 0.97 },
    fanout_count: 70,
    fanout_tvl_usd: "39500000000",
    ...overrides,
  } as AlertRow;
}

function makeAffected(
  name: string,
  blast: string,
  overrides: Partial<AffectedEntityRow> = {},
): AffectedEntityRow {
  return {
    entity_id: `entity-${name}`,
    name,
    sector: "DeFi",
    tvl_usd: blast,
    risk_score: "0.7",
    risk_tier: "high",
    coverage_tier: "core",
    blast_radius_usd: blast,
    oracle_providers: ["Chainlink"],
    bridge_dependencies: null,
    stablecoin_dependencies: ["USDC"],
    chain_deployments: ["ethereum"],
    state: "active",
    defillama_slug: null,
    admin_address: null,
    ...overrides,
  };
}

function emptyBuckets(): DigestBuckets {
  return { critical: [], high: [], medium: [], low: [] };
}

describe("digestSubject", () => {
  it("matches the spec format", () => {
    const subject = digestSubject({
      critical: 2,
      high: 5,
      medium: 0,
      low: 0,
      total: 7,
    });
    expect(subject).toBe("Chaindrain Daily — 2 critical / 5 high alerts");
  });

  it("renders zero counts", () => {
    expect(digestSubject(countBuckets(emptyBuckets()))).toBe(
      "Chaindrain Daily — 0 critical / 0 high alerts",
    );
  });
});

describe("renderDigestEmail — empty window", () => {
  it("returns the 'no alerts' subject and body without throwing", () => {
    const out = renderDigestEmail({
      windowHours: 24,
      generatedAt: new Date("2026-05-16T09:00:00.000Z"),
      buckets: emptyBuckets(),
    });
    expect(out.subject).toBe("Chaindrain Daily — 0 critical / 0 high alerts");
    expect(out.counts.total).toBe(0);
    expect(out.text).toContain("No alerts in the last 24h");
    expect(out.html).toContain("No alerts in the last 24h");
    expect(out.html).toContain("https://www.chaindrain.xyz/alerts");
  });
});

describe("renderDigestEmail — populated buckets", () => {
  const critical: DigestAlertEntry = {
    alert: makeAlert(),
    topAffected: [
      makeAffected("Ether.fi Cash", "8200000000"),
      makeAffected("JustLend", "4100000000"),
      makeAffected("BlackRock BUIDL", "3500000000"),
      makeAffected("Securitize", "2900000000"),
      makeAffected("Ondo", "1800000000"),
      makeAffected("Aave", "1700000000"),
    ],
  };
  const high: DigestAlertEntry = {
    alert: makeAlert({
      alert_id: "22222222-2222-2222-2222-222222222222",
      severity: "high",
      signal_type: "tvl_drop",
      dependency_key: "liquity-v2",
      dependency_field: "defillama_slug",
      fanout_count: 3,
      fanout_tvl_usd: "120000000",
      raw_signal: { change_1d: -0.2455 },
    }),
    topAffected: [makeAffected("Liquity V2", "120000000")],
  };
  const buckets: DigestBuckets = {
    critical: [critical],
    high: [high],
    medium: [],
    low: [],
  };

  it("computes the correct subject", () => {
    const out = renderDigestEmail({
      windowHours: 24,
      generatedAt: new Date("2026-05-16T09:00:00.000Z"),
      buckets,
    });
    expect(out.subject).toBe("Chaindrain Daily — 1 critical / 1 high alerts");
  });

  it("renders the canonical 3-line shape per alert in the text body", () => {
    const out = renderDigestEmail({
      windowHours: 24,
      generatedAt: new Date("2026-05-16T09:00:00.000Z"),
      buckets,
    });
    const lines = out.text.split("\n");
    expect(lines).toContain(
      "- Stablecoin depeg · USDC (Stablecoin)",
    );
    expect(lines).toContain(
      "  Fanout: 70 entities · blast radius $39.5B",
    );
    expect(lines).toContain(
      "  Top affected: Ether.fi Cash ($8.2B)",
    );
  });

  it("includes the top-5 expansion for critical alerts", () => {
    const out = renderDigestEmail({
      windowHours: 24,
      generatedAt: new Date("2026-05-16T09:00:00.000Z"),
      buckets,
    });
    expect(out.text).toContain("Top 5 by blast radius:");
    expect(out.text).toContain("Ether.fi Cash — $8.2B");
    expect(out.text).toContain("Ondo — $1.8B");
    expect(out.text).not.toContain("Aave — $1.7B");
    expect(out.html).toContain("Top 5 affected by blast radius:");
  });

  it("does not expand top-5 for non-critical alerts", () => {
    const onlyHigh = renderDigestEmail({
      windowHours: 24,
      generatedAt: new Date("2026-05-16T09:00:00.000Z"),
      buckets: { critical: [], high: [high], medium: [], low: [] },
    });
    expect(onlyHigh.text).not.toContain("Top 5 by blast radius:");
  });

  it("escapes HTML-dangerous characters in alert names", () => {
    const xss = makeAffected('"><script>alert(1)</script>', "100");
    const out = renderDigestEmail({
      windowHours: 24,
      generatedAt: new Date("2026-05-16T09:00:00.000Z"),
      buckets: {
        critical: [{ alert: makeAlert(), topAffected: [xss] }],
        high: [],
        medium: [],
        low: [],
      },
    });
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("uses a custom appBaseUrl when provided", () => {
    const out = renderDigestEmail({
      windowHours: 24,
      generatedAt: new Date("2026-05-16T09:00:00.000Z"),
      buckets,
      appBaseUrl: "https://staging.example.com/",
    });
    expect(out.html).toContain("https://staging.example.com/alerts");
    expect(out.html).not.toContain("https://staging.example.com//alerts");
    expect(out.text).toContain(
      `https://staging.example.com/alerts/${critical.alert.alert_id}`,
    );
  });

  it("singularizes the fanout label when fanout_count is 1", () => {
    const out = renderDigestEmail({
      windowHours: 24,
      generatedAt: new Date("2026-05-16T09:00:00.000Z"),
      buckets: {
        critical: [],
        high: [
          {
            alert: makeAlert({
              severity: "high",
              fanout_count: 1,
              fanout_tvl_usd: "50000",
              signal_type: "tvl_drop",
              dependency_field: "defillama_slug",
            }),
            topAffected: [makeAffected("LoneProtocol", "50000")],
          },
        ],
        medium: [],
        low: [],
      },
    });
    expect(out.text).toContain("Fanout: 1 entity · blast radius $50K");
  });

  it("handles a critical alert with zero affected entities cleanly", () => {
    const out = renderDigestEmail({
      windowHours: 24,
      generatedAt: new Date("2026-05-16T09:00:00.000Z"),
      buckets: {
        critical: [{ alert: makeAlert(), topAffected: [] }],
        high: [],
        medium: [],
        low: [],
      },
    });
    expect(out.text).toContain("Top affected: no affected entities found");
    expect(out.text).not.toContain("Top 5 by blast radius:");
    expect(out.html).toContain("no affected entities found");
  });
});
