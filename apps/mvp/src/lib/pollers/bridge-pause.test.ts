import { describe, expect, it } from "vitest";
import {
  AXELAR_MIN_MAINTAINERS,
  classifyBridgeReadings,
  WORMHOLE_GUARDIAN_QUORUM,
} from "./bridge-pause";

const observed_at = new Date("2026-05-16T12:00:00Z");

describe("classifyBridgeReadings", () => {
  it("emits no alerts when everything is healthy", () => {
    expect(
      classifyBridgeReadings(
        {
          layerzero_paused: false,
          wormhole_active_guardians: WORMHOLE_GUARDIAN_QUORUM + 1,
          axelar_chains: [
            { chain: "ethereum", maintainers: AXELAR_MIN_MAINTAINERS + 2 },
            { chain: "polygon", maintainers: AXELAR_MIN_MAINTAINERS + 1 },
          ],
        },
        observed_at,
      ),
    ).toEqual([]);
  });

  it("emits critical LayerZero alert when endpoint is paused", () => {
    const alerts = classifyBridgeReadings(
      {
        layerzero_paused: true,
        wormhole_active_guardians: null,
        axelar_chains: [],
      },
      observed_at,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("critical");
    expect(alerts[0]?.dependency_key).toBe("LayerZero");
    expect(alerts[0]?.dependency_field).toBe("bridge_dependencies");
  });

  it("emits critical Wormhole alert when guardian count is below quorum", () => {
    const alerts = classifyBridgeReadings(
      {
        layerzero_paused: false,
        wormhole_active_guardians: WORMHOLE_GUARDIAN_QUORUM - 1,
        axelar_chains: [],
      },
      observed_at,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.dependency_key).toBe("Wormhole");
    expect(alerts[0]?.severity).toBe("critical");
  });

  it("emits one Axelar alert per under-maintained chain", () => {
    const alerts = classifyBridgeReadings(
      {
        layerzero_paused: false,
        wormhole_active_guardians: WORMHOLE_GUARDIAN_QUORUM,
        axelar_chains: [
          { chain: "ethereum", maintainers: 1 },
          { chain: "polygon", maintainers: AXELAR_MIN_MAINTAINERS + 1 },
          { chain: "fantom", maintainers: 0 },
        ],
      },
      observed_at,
    );
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) {
      expect(alert.dependency_key).toBe("Axelar");
      expect(alert.severity).toBe("critical");
    }
  });

  it("treats null readings as missing (no alert)", () => {
    expect(
      classifyBridgeReadings(
        {
          layerzero_paused: null,
          wormhole_active_guardians: null,
          axelar_chains: [],
        },
        observed_at,
      ),
    ).toEqual([]);
  });
});
