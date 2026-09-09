import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, type NetworkApi, type SignerApi } from "./App";
import type { PreparedPayment, WalletStatus } from "./network/mainnet";
import type { SecureVaultApi } from "./vault/secureVault";
import type { QrScannerApi } from "./scanner/qrScanner";
import type { LocalOutgoingHistoryApi } from "./history/localOutgoingHistory";

afterEach(cleanup);

const PHRASE = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
const ADDRESS = "zkas:px8dx79gspafw49lw989mzdxhlqt6pehw9ql54r8ayyymv59vday3mtyxm432g4t6we2gygp3udqluy";
const RECIPIENT = "zkas:pr8dx79gspafw49lw989mzdxhlqt6pehw9ql54r8ayyymv59vday3mtyxm432g4t6we2gygp3udqluy";
const ACCOUNT_SEED = "ab".repeat(32);
const FVK = "cd".repeat(96);
const TOKEN = "ef".repeat(16);

function walletStatus(overrides: Partial<WalletStatus> = {}): WalletStatus {
  return {
    has_wallet: true,
    address: ADDRESS,
    network: "mainnet",
    node_connected: true,
    daa_score: 123456,
    synced: true,
    spend_ready: true,
    scanned_blocks: 10,
    chain_len: 10,
    balance_sompi: "200000000",
    balance_fc: "2.00000000",
    spendable_sompi: "200000000",
    maturing_sompi: "0",
    note_count: 1,
    updated_unix: 1,
    error: null,
    ...overrides,
  };
}

function dependencies(exists = false) {
  const vault: SecureVaultApi = {
    status: vi.fn().mockResolvedValue({
      available: true,
      exists,
      platform: "ios",
      protection: "biometric-or-device-passcode",
      ...(exists ? { address: ADDRESS } : {}),
    }),
    save: vi.fn().mockResolvedValue({ address: ADDRESS }),
    unlock: vi.fn().mockResolvedValue({
      address: ADDRESS,
      fvkHex: FVK,
      walletToken: TOKEN,
      birthdayDaa: 123456,
    }),
    authorize: vi.fn().mockResolvedValue({ address: ADDRESS, accountSeedHex: ACCOUNT_SEED }),
    revealRecovery: vi.fn().mockResolvedValue({ address: ADDRESS, mnemonic: PHRASE }),
    remove: vi.fn().mockResolvedValue({ removed: true }),
  };
  const signer: SignerApi = {
    generateMnemonicWallet: vi.fn().mockResolvedValue({ mnemonic: PHRASE, address: ADDRESS }),
    isValidMnemonic: vi.fn().mockResolvedValue(true),
    accountAddress: vi.fn().mockResolvedValue(ADDRESS),
    accountSeedHex: vi.fn().mockResolvedValue(ACCOUNT_SEED),
    fvkHex: vi.fn().mockResolvedValue(FVK),
  };
  const prepared: PreparedPayment = {
    session: "session-1",
    to: RECIPIENT,
    amountSompi: 100_000_000n,
    feeSompi: 1_900_000n,
    spendCount: 2,
    bundleHex: "aa",
    disclosure: [],
    spendAuth: [{ index: 0, alpha: "bb" }],
  };
  const network: NetworkApi = {
    status: vi.fn().mockResolvedValue(walletStatus()),
    watch: vi.fn().mockResolvedValue({ address: ADDRESS }),
    history: vi.fn().mockResolvedValue({ recoverableHistory: true, total: 0, rows: [] }),
    prepare: vi.fn().mockResolvedValue(prepared),
    sign: vi.fn().mockResolvedValue([{ index: 0, sig: "signature" }]),
    submit: vi.fn().mockResolvedValue({ txid: "12".repeat(32), amount_sompi: 100_000_000, fee_sompi: 1_900_000 }),
  };
  return { vault, signer, network, prepared };
}

async function openSetup(vault: SecureVaultApi, signer: SignerApi, network: NetworkApi) {
  render(<App vault={vault} signer={signer} network={network} confirmationPositions={[0, 5, 11]} />);
  fireEvent.click(await screen.findByRole("button", { name: /create or restore wallet/i }));
}

function answerBackupCheck() {
  fireEvent.change(screen.getByLabelText("Word 1"), { target: { value: "alpha" } });
  fireEvent.change(screen.getByLabelText("Word 6"), { target: { value: "foxtrot" } });
  fireEvent.change(screen.getByLabelText("Word 12"), { target: { value: "lima" } });
}

describe("Stream Wallet mainnet flow", () => {
  it("labels live mainnet while keeping actions locked behind device authentication", async () => {
    const { vault, signer, network } = dependencies();
    render(<App vault={vault} signer={signer} network={network} />);
    expect(screen.getByText("Live ZKAS mainnet.")).toBeInTheDocument();
    expect(screen.getByText("ZKAS mainnet")).toBeInTheDocument();
    for (const action of ["Receive", "Send"]) {
      expect(screen.getByRole("button", { name: action })).toBeDisabled();
    }
    expect(screen.queryByRole("button", { name: "Scan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request" })).not.toBeInTheDocument();
  });

  it("creates official account material and saves only after backup confirmation", async () => {
    const { vault, signer, network } = dependencies();
    await openSetup(vault, signer, network);
    fireEvent.click(screen.getByRole("button", { name: /create new wallet/i }));
    expect(await screen.findByRole("heading", { name: /your recovery phrase/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /i wrote these words down/i }));

    fireEvent.change(screen.getByLabelText("Word 1"), { target: { value: "wrong" } });
    fireEvent.change(screen.getByLabelText("Word 6"), { target: { value: "foxtrot" } });
    fireEvent.change(screen.getByLabelText("Word 12"), { target: { value: "lima" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and encrypt/i }));
    expect(await screen.findByText(/one or more words do not match/i)).toBeInTheDocument();
    expect(vault.save).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Word 1"), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and encrypt/i }));
    await waitFor(() => expect(vault.save).toHaveBeenCalledWith({
      mnemonic: PHRASE,
      address: ADDRESS,
      accountSeedHex: ACCOUNT_SEED,
      fvkHex: FVK,
      walletToken: expect.stringMatching(/^[0-9a-f]{32}$/),
      birthdayDaa: 123456,
    }));
    expect(await screen.findByRole("button", { name: /unlock wallet/i })).toBeInTheDocument();
  });

  it("restores account 0 and uses a genesis birthday for complete discovery", async () => {
    const { vault, signer, network } = dependencies();
    await openSetup(vault, signer, network);
    fireEvent.click(screen.getByRole("button", { name: /^restore wallet/i }));
    fireEvent.change(screen.getByLabelText("Recovery phrase"), { target: { value: PHRASE.toUpperCase() } });
    fireEvent.click(screen.getByRole("button", { name: /validate and continue/i }));
    expect(await screen.findByRole("heading", { name: /confirm your recovery phrase/i })).toBeInTheDocument();
    answerBackupCheck();
    fireEvent.click(screen.getByRole("button", { name: /confirm and encrypt/i }));

    await waitFor(() => expect(vault.save).toHaveBeenCalledWith(expect.objectContaining({
      mnemonic: PHRASE,
      address: ADDRESS,
      accountSeedHex: ACCOUNT_SEED,
      fvkHex: FVK,
      birthdayDaa: 0,
    })));
  });

  it("connects a viewing-key-only wallet and exposes the real receive address", async () => {
    const { vault, signer, network } = dependencies(true);
    render(<App vault={vault} signer={signer} network={network} />);
    fireEvent.click(await screen.findByRole("button", { name: /unlock wallet/i }));
    await waitFor(() => expect(network.status).toHaveBeenCalledWith(TOKEN));
    expect(await screen.findByText("Ready on ZKAS mainnet")).toBeInTheDocument();
    const receive = screen.getByRole("button", { name: "Receive" });
    expect(receive).toBeEnabled();
    fireEvent.click(receive);
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();
    expect(screen.getByTitle("ZKAS receiving address QR code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy full address/i })).toBeInTheDocument();
  });

  it("requires native authentication before displaying the recovery phrase", async () => {
    const { vault, signer, network } = dependencies(true);
    render(<App vault={vault} signer={signer} network={network} />);
    fireEvent.click(await screen.findByRole("button", { name: /security/i }));
    fireEvent.click(screen.getByRole("button", { name: /view recovery phrase/i }));
    await waitFor(() => expect(vault.revealRecovery).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: /your recovery phrase/i })).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /i verified my backup/i }));
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
  });

  it("labels maturing change and keeps Send disabled until it is spendable", async () => {
    const { vault, signer, network } = dependencies(true);
    vi.mocked(network.status).mockResolvedValue(walletStatus({
      balance_sompi: "72000000",
      spendable_sompi: "0",
      maturing_sompi: "72000000",
    }));
    render(<App vault={vault} signer={signer} network={network} />);
    fireEvent.click(await screen.findByRole("button", { name: /unlock wallet/i }));
    expect(await screen.findByText("Change maturing · not yet spendable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("reports a detected balance honestly when itemized history is unavailable", async () => {
    const { vault, signer, network } = dependencies(true);
    render(<App vault={vault} signer={signer} network={network} />);
    fireEvent.click(await screen.findByRole("button", { name: /unlock wallet/i }));
    await screen.findByText("Ready on ZKAS mainnet");
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(await screen.findByRole("heading", { name: "Balance detected" })).toBeInTheDocument();
    expect(screen.getByText(/2 ZKAS is visible.*incoming itemized records are not currently available/i)).toBeInTheDocument();
    expect(screen.getByText("Outgoing transactions only")).toBeInTheDocument();
  });

  it("uses a valid scanned address only to prefill the unsigned payment form", async () => {
    const { vault, signer, network } = dependencies(true);
    const scanner: QrScannerApi = { scanAddress: vi.fn().mockResolvedValue(RECIPIENT) };
    render(<App vault={vault} signer={signer} network={network} scanner={scanner} />);
    fireEvent.click(await screen.findByRole("button", { name: /unlock wallet/i }));
    await screen.findByText("Ready on ZKAS mainnet");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(screen.getByRole("button", { name: /scan recipient qr code/i }));
    expect(await screen.findByDisplayValue(RECIPIENT)).toBeInTheDocument();
    expect(screen.getByLabelText("Amount in ZKAS")).toHaveValue("");
    expect(network.prepare).not.toHaveBeenCalled();
    expect(vault.authorize).not.toHaveBeenCalled();
    expect(network.submit).not.toHaveBeenCalled();
  });

  it("rejects a scanned QR code that is not a ZKAS mainnet address", async () => {
    const { vault, signer, network } = dependencies(true);
    const scanner: QrScannerApi = { scanAddress: vi.fn().mockResolvedValue("https://example.com") };
    render(<App vault={vault} signer={signer} network={network} scanner={scanner} />);
    fireEvent.click(await screen.findByRole("button", { name: /unlock wallet/i }));
    await screen.findByText("Ready on ZKAS mainnet");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(screen.getByRole("button", { name: /scan recipient qr code/i }));
    expect(await screen.findByText(/does not contain a complete ZKAS mainnet address/i)).toBeInTheDocument();
    expect(network.prepare).not.toHaveBeenCalled();
    expect(vault.authorize).not.toHaveBeenCalled();
    expect(network.submit).not.toHaveBeenCalled();
  });

  it("returns shared content to the top when changing tabs", async () => {
    const { vault, signer, network } = dependencies(true);
    const { container } = render(<App vault={vault} signer={signer} network={network} />);
    const content = container.querySelector<HTMLElement>(".screen-content");
    expect(content).not.toBeNull();
    if (!content) return;
    content.scrollTop = 250;
    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(content.scrollTop).toBe(0);
  });

  it("requires exact fee review and fresh device authorization before broadcasting", async () => {
    const { vault, signer, network, prepared } = dependencies(true);
    const outgoingHistory: LocalOutgoingHistoryApi = {
      load: vi.fn().mockReturnValue([]),
      add: vi.fn().mockImplementation((record) => [record]),
      removeWallet: vi.fn(),
    };
    render(<App vault={vault} signer={signer} network={network} outgoingHistory={outgoingHistory} />);
    fireEvent.click(await screen.findByRole("button", { name: /unlock wallet/i }));
    const send = await screen.findByRole("button", { name: "Send" });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    fireEvent.change(screen.getByLabelText("Recipient address"), { target: { value: RECIPIENT } });
    fireEvent.change(screen.getByLabelText("Amount in ZKAS"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /calculate fee and review/i }));

    expect(await screen.findByText("0.019 ZKAS")).toBeInTheDocument();
    expect(vault.authorize).not.toHaveBeenCalled();
    expect(network.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /authenticate and broadcast/i }));
    await waitFor(() => expect(network.sign).toHaveBeenCalledWith(ACCOUNT_SEED, prepared));
    expect(vault.authorize).toHaveBeenCalledOnce();
    expect(network.submit).toHaveBeenCalledWith(TOKEN, "session-1", [{ index: 0, sig: "signature" }]);
    expect(outgoingHistory.add).toHaveBeenCalledWith(expect.objectContaining({
      kind: "sent",
      txid: "12".repeat(32),
      walletAddress: ADDRESS,
      recipient: RECIPIENT,
      amountSompi: "100000000",
      feeSompi: "1900000",
      timestamp: expect.any(Number),
    }));
    expect(await screen.findByRole("heading", { name: /payment sent/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(await screen.findByText("saved on this device", { exact: false })).toBeInTheDocument();
  });

  it("supports local lock and authenticated permanent removal", async () => {
    const { vault, signer, network } = dependencies(true);
    render(<App vault={vault} signer={signer} network={network} />);
    fireEvent.click(await screen.findByRole("button", { name: /unlock wallet/i }));
    expect(await screen.findByText("Ready on ZKAS mainnet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    fireEvent.click(screen.getByRole("button", { name: /lock wallet/i }));
    expect(screen.getByRole("button", { name: /unlock wallet/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove wallet from device/i }));
    fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: /authenticate and remove/i }));
    await waitFor(() => expect(vault.remove).toHaveBeenCalledOnce());
    expect(await screen.findByRole("button", { name: /create or restore wallet/i })).toBeInTheDocument();
  });
});
