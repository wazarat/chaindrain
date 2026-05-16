import { describe, expect, it } from "vitest";
import {
  classifyTvlDrops,
  CRITICAL_THRESHOLD_PCT,
  HIGH_THRESHOLD_PCT,
  pollTvlDrop,
} from "./tvl-drop";
import type { PollerContext } from "./types";

const observed_at = new Date("2026-05-16T12:00:00Z");

describe("classifyTvlDrops", () => {
  it("ignores protocols not in the watch list", () => {
    const alerts = classifyTvlDrops(
      [
        { slug: "unknown-protocol", tvl: 1000, change_1d: -50 },
      ],
      new Set(),
      observed_at,
    );
    expect(alerts).toEqual([]);
  });

  it("ignores protocols with non-negative or sub-threshold change", () => {
    const alerts = classifyTvlDrops(
      [
        { slug: "lido", tvl: 1000, change_1d: -5 },
        { slug: "uniswap", tvl: 1000, change_1d: 12 },
        { slug: "aave", tvl: 1000, change_1d: -19.9 },
      ],
      new Set(["lido", "uniswap", "aave"]),
      observed_at,
    );
    expect(alerts).toEqual([]);
  });

  it("emits high severity for drops in (-40, -20] %", () => {
    const alerts = classifyTvlDrops(
      [
        { slug: "lido", tvl: 5_000_000, change_1d: HIGH_THRESHOLD_PCT - 5 },
      ],
      new Set(["lido"]),
      observed_at,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("high");
    expect(alerts[0]?.dependency_field).toBe("defillama_slug");
    expect(alerts[0]?.dependency_key).toBe("lido");
  });

  it("emits critical for drops <= -40%", () => {
    const alerts = classifyTvlDrops(
      [
        {
          slug: "rekt-protocol",
          tvl: 50,
          change_1d: CRITICAL_THRESHOLD_PCT - 10,
        },
      ],
      new Set(["rekt-protocol"]),
      observed_at,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("critical");
  });
});

describe("pollTvlDrop", () => {
  it("returns empty when no slugs are watched", async () => {
    const ctx: PollerContext = {
      fetch: async () => new Response("[]"),
      now: () => observed_at,
      env: {} as unknown as NodeJS.ProcessEnv,
    };
    const out = await pollTvlDrop(ctx, { watched_slugs: [] });
    expect(out).toEqual([]);
  });

  it("propagates DefiLlama responses through the classifier", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          { slug: "lido", tvl: 1000, change_1d: -55, name: "Lido" },
          { slug: "uniswap", tvl: 2000, change_1d: 5, name: "Uniswap" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const ctx: PollerContext = {
      fetch: fetchMock,
      now: () => observed_at,
      env: {} as unknown as NodeJS.ProcessEnv,
    };
    const out = await pollTvlDrop(ctx, {
      watched_slugs: ["lido", "uniswap"],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.dependency_key).toBe("lido");
    expect(out[0]?.severity).toBe("critical");
  });
});
