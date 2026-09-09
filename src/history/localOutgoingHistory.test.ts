import { beforeEach, describe, expect, it } from "vitest";
import { localOutgoingHistory, type LocalOutgoingRecord } from "./localOutgoingHistory";

const WALLET = `zkas:${"a".repeat(80)}`;
const OTHER_WALLET = `zkas:${"b".repeat(80)}`;

function record(overrides: Partial<LocalOutgoingRecord> = {}): LocalOutgoingRecord {
  return {
    kind: "sent",
    txid: "12".repeat(32),
    walletAddress: WALLET,
    recipient: `zkas:${"c".repeat(80)}`,
    amountSompi: "25000000",
    feeSompi: "3000000",
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(() => localStorage.clear());

describe("local outgoing history", () => {
  it("stores exact payment metadata and isolates wallet accounts", () => {
    localOutgoingHistory.add(record());
    localOutgoingHistory.add(record({ txid: "34".repeat(32), walletAddress: OTHER_WALLET }));
    expect(localOutgoingHistory.load(WALLET)).toEqual([record()]);
  });

  it("deduplicates broadcasts and clears records when the wallet is removed", () => {
    localOutgoingHistory.add(record());
    localOutgoingHistory.add(record({ timestamp: 1_800_000_000_000 }));
    expect(localOutgoingHistory.load(WALLET)).toHaveLength(1);
    expect(localOutgoingHistory.load(WALLET)[0].timestamp).toBe(1_800_000_000_000);
    localOutgoingHistory.removeWallet(WALLET);
    expect(localOutgoingHistory.load(WALLET)).toEqual([]);
  });
});
