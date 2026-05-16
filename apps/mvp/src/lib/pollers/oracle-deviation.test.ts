import { describe, expect, it } from "vitest";
import {
  classifyOracleDeviations,
  HIGH_THRESHOLD,
  MEDIUM_THRESHOLD,
} from "./oracle-deviation";

const observed_at = new Date("2026-05-16T12:00:00Z");

describe("classifyOracleDeviations", () => {
  it("emits no alert when readings match reference", () => {
    const alerts = classifyOracleDeviations({
      references: { ethereum: { usd: 3000 } },
      chainlink: new Map([["ETH/USD", { price: 3000, updated_at: 1 }]]),
      pyth: new Map(),
      observed_at,
    });
    expect(alerts).toEqual([]);
  });

  it("emits medium severity for 2% Chainlink deviation", () => {
    const alerts = classifyOracleDeviations({
      references: { ethereum: { usd: 3000 } },
      chainlink: new Map([["ETH/USD", { price: 3060, updated_at: 1 }]]),
      pyth: new Map(),
      observed_at,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("medium");
    expect(alerts[0]?.dependency_key).toBe("Chainlink");
    expect(alerts[0]?.dependency_field).toBe("oracle_providers");
  });

  it("emits high severity for >5% Pyth deviation", () => {
    const alerts = classifyOracleDeviations({
      references: { ethereum: { usd: 3000 } },
      chainlink: new Map(),
      pyth: new Map([
        [
          "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
          { price: 3200, publish_time: 1 },
        ],
      ]),
      observed_at,
    });
    expect(alerts).toHaveLength(1);
    const alert = alerts[0]!;
    expect(alert.severity).toBe("high");
    expect(alert.dependency_key).toBe("Pyth");
    expect(alert.signal_type).toBe("oracle_deviation");
  });

  it("emits one alert per disagreeing source when both deviate", () => {
    const alerts = classifyOracleDeviations({
      references: { bitcoin: { usd: 60000 } },
      chainlink: new Map([["BTC/USD", { price: 62000, updated_at: 1 }]]),
      pyth: new Map([
        [
          "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
          { price: 65000, publish_time: 1 },
        ],
      ]),
      observed_at,
    });
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.dependency_key).sort()).toEqual([
      "Chainlink",
      "Pyth",
    ]);
  });

  it("uses threshold constants consistently", () => {
    expect(MEDIUM_THRESHOLD).toBeLessThan(HIGH_THRESHOLD);
    expect(MEDIUM_THRESHOLD).toBeGreaterThan(0);
  });

  it("skips when reference is missing or zero", () => {
    const alerts = classifyOracleDeviations({
      references: { ethereum: { usd: 0 } },
      chainlink: new Map([["ETH/USD", { price: 3060, updated_at: 1 }]]),
      pyth: new Map(),
      observed_at,
    });
    expect(alerts).toEqual([]);
  });
});
