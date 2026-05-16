import { describe, expect, it } from "vitest";
import { classifyAdminTx, pollAdminTx } from "./admin-tx";
import type { PollerContext } from "./types";

const observed_at = new Date("2026-05-16T12:00:00Z");

describe("classifyAdminTx", () => {
  it("marks EOA admin txs as high severity", () => {
    const alert = classifyAdminTx(
      {
        entity_id: "abc",
        name: "Test",
        admin_address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        upgrade_authority_type: "EOA",
      },
      {
        hash: "0xdead",
        blockNumber: "1",
        timeStamp: "100",
        from: "0xAAAA",
        to: "0xBBBB",
      },
      observed_at,
    );
    expect(alert.severity).toBe("high");
    expect(alert.signal_type).toBe("admin_tx");
    expect(alert.dependency_field).toBe("admin_address");
    expect(alert.dependency_key).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("marks Multisig admin txs as high severity", () => {
    const alert = classifyAdminTx(
      {
        entity_id: "x",
        name: "Multisig Test",
        admin_address: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
        upgrade_authority_type: "Multisig",
      },
      {
        hash: "0xfeed",
        blockNumber: "2",
        timeStamp: "200",
        from: "0xCCCC",
        to: "0xDDDD",
      },
      observed_at,
    );
    expect(alert.severity).toBe("high");
  });

  it("marks Timelock/DAO admin txs as medium severity", () => {
    const alert = classifyAdminTx(
      {
        entity_id: "y",
        name: "Timelock Test",
        admin_address: "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
        upgrade_authority_type: "Timelock",
      },
      {
        hash: "0xbeef",
        blockNumber: "3",
        timeStamp: "300",
        from: "0xEEEE",
        to: "0xFFFF",
      },
      observed_at,
    );
    expect(alert.severity).toBe("medium");
  });
});

describe("pollAdminTx", () => {
  it("returns empty when ETHERSCAN_API_KEY is missing", async () => {
    const ctx: PollerContext = {
      fetch: async () => new Response("{}"),
      now: () => observed_at,
      env: {} as unknown as NodeJS.ProcessEnv,
    };
    const out = await pollAdminTx(ctx, { entities: [] });
    expect(out).toEqual([]);
  });

  it("filters txs older than the lookback window", async () => {
    const now = new Date("2026-05-16T12:00:00Z");
    const cutoff = Math.floor(now.getTime() / 1000) - 5 * 60;
    const oldTs = cutoff - 60;
    const recentTs = cutoff + 30;
    const fetchMock: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: "1",
          message: "OK",
          result: [
            {
              hash: "0xrecent",
              blockNumber: "100",
              timeStamp: String(recentTs),
              from: "0x1",
              to: "0x2",
            },
            {
              hash: "0xold",
              blockNumber: "99",
              timeStamp: String(oldTs),
              from: "0x1",
              to: "0x2",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const ctx: PollerContext = {
      fetch: fetchMock,
      now: () => now,
      env: { ETHERSCAN_API_KEY: "stub" } as unknown as NodeJS.ProcessEnv,
    };
    const out = await pollAdminTx(ctx, {
      entities: [
        {
          entity_id: "e1",
          name: "E1",
          admin_address: "0x1111111111111111111111111111111111111111",
          upgrade_authority_type: "EOA",
        },
      ],
    });
    expect(out).toHaveLength(1);
    const raw = out[0]!.raw_signal as Record<string, unknown>;
    expect(raw.tx_hash).toBe("0xrecent");
  }, 10_000);
});
