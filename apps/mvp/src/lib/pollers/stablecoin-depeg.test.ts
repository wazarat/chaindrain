import { describe, expect, it } from "vitest";
import {
  CRITICAL_THRESHOLD,
  classifyStablecoinPrices,
  HIGH_THRESHOLD,
  pollStablecoinDepeg,
  STABLES,
} from "./stablecoin-depeg";
import type { PollerContext } from "./types";

function ctxWithFetch(mockFetch: typeof fetch): PollerContext {
  return {
    fetch: mockFetch,
    now: () => new Date("2026-05-16T12:00:00Z"),
    env: {} as unknown as NodeJS.ProcessEnv,
  };
}

describe("stablecoin-depeg classifier", () => {
  it("emits no alert when all stables are within tolerance", () => {
    const prices = Object.fromEntries(
      STABLES.map((s) => [s.coingecko_id, { usd: 1.0 }]),
    );
    expect(
      classifyStablecoinPrices(prices, new Date("2026-05-16T12:00:00Z")),
    ).toEqual([]);
  });

  it("emits high severity when deviation exceeds 0.5% but stays under 2%", () => {
    const prices: Record<string, { usd: number }> = {
      "usd-coin": { usd: 0.99 },
    };
    const alerts = classifyStablecoinPrices(
      prices,
      new Date("2026-05-16T12:00:00Z"),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("high");
    expect(alerts[0]?.signal_type).toBe("stablecoin_depeg");
    expect(alerts[0]?.dependency_key).toBe("USDC");
    expect(alerts[0]?.dependency_field).toBe("stablecoin_dependencies");
    expect(
      Number((alerts[0]?.raw_signal as Record<string, unknown>).deviation),
    ).toBeCloseTo(0.01, 5);
  });

  it("emits critical severity for USDC=0.97 (acceptance criterion)", () => {
    const prices: Record<string, { usd: number }> = {
      "usd-coin": { usd: 0.97 },
    };
    const alerts = classifyStablecoinPrices(
      prices,
      new Date("2026-05-16T12:00:00Z"),
    );
    expect(alerts).toHaveLength(1);
    const alert = alerts[0]!;
    expect(alert.severity).toBe("critical");
    expect(alert.dependency_key).toBe("USDC");
    expect(alert.dependency_field).toBe("stablecoin_dependencies");
    const raw = alert.raw_signal as Record<string, unknown>;
    expect(raw.source).toBe("coingecko");
    expect(raw.price).toBe(0.97);
    expect(Number(raw.deviation)).toBeCloseTo(0.03, 5);
  });

  it("ignores non-numeric or zero prices", () => {
    const prices = {
      "usd-coin": { usd: 0 },
      tether: { usd: NaN },
      dai: {},
    } as unknown as Record<string, { usd?: number }>;
    expect(
      classifyStablecoinPrices(prices, new Date("2026-05-16T12:00:00Z")),
    ).toEqual([]);
  });

  it("honors threshold boundaries", () => {
    const justBelowHigh = 1 - HIGH_THRESHOLD / 2;
    const wellInsideHigh = 1 - (HIGH_THRESHOLD + 0.001);
    const wellInsideCritical = 1 - (CRITICAL_THRESHOLD + 0.001);

    expect(
      classifyStablecoinPrices(
        { "usd-coin": { usd: justBelowHigh } },
        new Date(),
      ),
    ).toHaveLength(0);
    const atHigh = classifyStablecoinPrices(
      { "usd-coin": { usd: wellInsideHigh } },
      new Date(),
    );
    expect(atHigh[0]?.severity).toBe("high");
    const atCritical = classifyStablecoinPrices(
      { "usd-coin": { usd: wellInsideCritical } },
      new Date(),
    );
    expect(atCritical[0]?.severity).toBe("critical");
  });
});

describe("pollStablecoinDepeg with mocked fetch", () => {
  it("propagates synthetic USDC=0.97 through to a critical alert", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          "usd-coin": { usd: 0.97 },
          tether: { usd: 1.0 },
          dai: { usd: 1.001 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const alerts = await pollStablecoinDepeg(ctxWithFetch(mockFetch));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("critical");
    expect(alerts[0]?.dependency_key).toBe("USDC");
    expect(alerts[0]?.dependency_field).toBe("stablecoin_dependencies");
  });

  it("throws on HTTP failure", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response("rate limited", { status: 429 });
    await expect(pollStablecoinDepeg(ctxWithFetch(mockFetch))).rejects.toThrow(
      /coingecko http 429/,
    );
  });
});
