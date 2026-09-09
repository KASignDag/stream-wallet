import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatSompi, mainnetApi, minRelayFeeForSpends, parseZkasAmount, type WalletConnection,
} from "./mainnet";

const connection: WalletConnection = {
  address: "zkas:px8dx79gspafw49lw989mzdxhlqt6pehw9ql54r8ayyymv59vday3mtyxm432g4t6we2gygp3udqluy",
  fvkHex: "cd".repeat(96),
  walletToken: "ef".repeat(16),
  birthdayDaa: 100,
};

afterEach(() => vi.unstubAllGlobals());

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

function prepared(overrides: Record<string, unknown> = {}) {
  return {
    session: "session",
    amount_sompi: 100_000_000,
    fee_sompi: 1_855_400,
    remaining_sompi: 0,
    amount_sompi_exact: "100000000",
    fee_sompi_exact: "1855400",
    remaining_sompi_exact: "0",
    spend_auth: [{ index: 0, alpha: "aa" }, { index: 1, alpha: "bb" }],
    bundle_hex: "cc",
    disclosure: [],
    ...overrides,
  };
}

describe("mainnet amount and fee safety", () => {
  it("parses ZKAS only once into exact integer sompi", () => {
    expect(parseZkasAmount("1")).toBe(100_000_000n);
    expect(parseZkasAmount("0.00000001")).toBe(1n);
    expect(parseZkasAmount("1.23456789")).toBe(123_456_789n);
    expect(parseZkasAmount("1.234567891")).toBeNull();
    expect(parseZkasAmount("1e2")).toBeNull();
    expect(parseZkasAmount("0")).toBeNull();
    expect(formatSompi(123_456_789n)).toBe("1.23456789");
  });

  it("matches the current official byte-priced relay fee figures", () => {
    expect(minRelayFeeForSpends(2)).toBe(1_855_400n);
    expect(minRelayFeeForSpends(15)).toBe(10_061_000n);
    expect(minRelayFeeForSpends(38)).toBe(24_578_600n);
  });

  it("accepts an exact complete prepared payment", async () => {
    const fetch = vi.fn(() => response(prepared()));
    vi.stubGlobal("fetch", fetch);
    const result = await mainnetApi.prepare(connection, connection.address, 100_000_000n);
    expect(result.amountSompi).toBe(100_000_000n);
    expect(result.feeSompi).toBe(1_855_400n);
    expect(fetch).toHaveBeenCalledWith(
      "https://wallet.zkas.info/daemon/api/wallet/prepare",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Wallet-Token": connection.walletToken }),
      }),
    );
  });

  it("refuses partial delivery before any signing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response(prepared({
      amount_sompi_exact: "90000000",
      remaining_sompi_exact: "10000000",
    }))));
    await expect(mainnetApi.prepare(connection, connection.address, 100_000_000n))
      .rejects.toThrow(/exact requested amount/i);
  });

  it("refuses a daemon fee above twice the current relay minimum", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response(prepared({ fee_sompi_exact: "3710801" }))));
    await expect(mainnetApi.prepare(connection, connection.address, 100_000_000n))
      .rejects.toThrow(/outside Stream Wallet's safety limit/i);
  });
});
