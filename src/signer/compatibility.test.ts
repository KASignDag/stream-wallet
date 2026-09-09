import { describe, expect, it } from "vitest";
import { accountAddress, addressFromSeed, fvkHex, isValidMnemonic } from "./index";

// Public, disposable test vector. This is not and must never be used as a wallet.
const ZERO_SEED = "00".repeat(32);
const OFFICIAL_MAINNET_ADDRESS =
  "zkas:p8xrvcqetysnk6cvmwt2whqhcwnx32tlp44gch8pvjj3365m4xjsaf63j87cvxc07y8x9vqla2vf9df";
const PUBLIC_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OFFICIAL_MNEMONIC_ADDRESS =
  "zkas:px8dx79gspafw49lw989mzdxhlqt6pehw9ql54r8ayyymv59vday3mtyxm432g4t6we2gygp3udqluy";

describe("official ZKAS signer compatibility", () => {
  it("derives the official mainnet address for the pinned public vector", async () => {
    await expect(addressFromSeed(ZERO_SEED, "mainnet")).resolves.toBe(OFFICIAL_MAINNET_ADDRESS);
  });

  it("derives a viewing key without exposing or changing the seed", async () => {
    const viewingKey = await fvkHex(ZERO_SEED);
    expect(viewingKey).toMatch(/^[0-9a-f]{192}$/);
    expect(viewingKey).not.toContain(ZERO_SEED);
  });

  it("restores the official account 0 address from a public 12-word vector", async () => {
    await expect(isValidMnemonic(PUBLIC_MNEMONIC)).resolves.toBe(true);
    await expect(accountAddress(PUBLIC_MNEMONIC, "mainnet", 0)).resolves.toBe(OFFICIAL_MNEMONIC_ADDRESS);
  });
});
