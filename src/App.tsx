import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  Activity, ArrowDownLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Eye, EyeOff,
  Fingerprint, Home, KeyRound, LoaderCircle, LockKeyhole, RefreshCw, ScanLine,
  ShieldCheck, Trash2, WalletCards, X,
} from "lucide-react";
import {
  accountAddress, accountSeedHex, fvkHex, generateMnemonicWallet, isValidMnemonic,
  type MnemonicWallet, type Network,
} from "./signer";
import {
  createWalletToken, formatSompi, mainnetApi, parseZkasAmount, type PreparedPayment,
  type SubmitResult, type WalletConnection, type WalletHistory, type WalletStatus,
} from "./network/mainnet";
import { secureVault, type SecureVaultApi, type VaultStatus } from "./vault/secureVault";
import { qrScanner, type QrScannerApi } from "./scanner/qrScanner";
import {
  localOutgoingHistory, type LocalOutgoingHistoryApi, type LocalOutgoingRecord,
} from "./history/localOutgoingHistory";
import { confirmationMatches, normalizeMnemonic, pickConfirmationPositions, shortAddress } from "./wallet/setup";

type Tab = "home" | "activity" | "security";
type SetupStep = "choose" | "creating" | "phrase" | "restore" | "confirm" | "saving";
type WalletSheet = "receive" | "send" | "recovery" | null;
type SendStep = "compose" | "preparing" | "review" | "signing" | "success";

interface DraftWallet {
  mnemonic: string;
  address: string;
  source: "created" | "restored";
}

export interface SignerApi {
  generateMnemonicWallet(network: Network): Promise<MnemonicWallet>;
  isValidMnemonic(secret: string): Promise<boolean>;
  accountAddress(mnemonic: string, network: Network, account: number): Promise<string>;
  accountSeedHex(mnemonic: string, account: number): Promise<string>;
  fvkHex(seedHex: string): Promise<string>;
}

export interface NetworkApi {
  status(token: string): Promise<WalletStatus>;
  watch(connection: WalletConnection): Promise<{ address: string }>;
  history(token: string): Promise<WalletHistory>;
  prepare(connection: WalletConnection, to: string, amountSompi: bigint): Promise<PreparedPayment>;
  sign(accountSeed: string, prepared: PreparedPayment): Promise<{ index: number; sig: string }[]>;
  submit(token: string, session: string, sigs: { index: number; sig: string }[]): Promise<SubmitResult>;
}

interface AppProps {
  vault?: SecureVaultApi;
  signer?: SignerApi;
  network?: NetworkApi;
  scanner?: QrScannerApi;
  outgoingHistory?: LocalOutgoingHistoryApi;
  confirmationPositions?: number[];
}

const defaultSigner: SignerApi = {
  generateMnemonicWallet, isValidMnemonic, accountAddress, accountSeedHex, fvkHex,
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return "Something went wrong. No wallet information was changed.";
}

function isMainnetAddress(value: string): boolean {
  return /^zkas:[a-z0-9]{40,}$/i.test(value.trim());
}

export function App({
  vault = secureVault,
  signer = defaultSigner,
  network = mainnetApi,
  scanner = qrScanner,
  outgoingHistory = localOutgoingHistory,
  confirmationPositions,
}: AppProps) {
  const [tab, setTab] = useState<Tab>("home");
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [connection, setConnection] = useState<WalletConnection | null>(null);
  const [networkStatus, setNetworkStatus] = useState<WalletStatus | null>(null);
  const [history, setHistory] = useState<WalletHistory | null>(null);
  const [localOutgoing, setLocalOutgoing] = useState<LocalOutgoingRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStep | null>(null);
  const [draft, setDraft] = useState<DraftWallet | null>(null);
  const [restoreInput, setRestoreInput] = useState("");
  const [challenge, setChallenge] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);
  const [error, setError] = useState("");
  const [networkError, setNetworkError] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeText, setRemoveText] = useState("");
  const [walletSheet, setWalletSheet] = useState<WalletSheet>(null);
  const [copied, setCopied] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [sendStep, setSendStep] = useState<SendStep>("compose");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [prepared, setPrepared] = useState<PreparedPayment | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const syncInFlight = useRef(false);
  const scannerInFlight = useRef(false);
  const lockEpoch = useRef(0);
  const screenContent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    vault.status()
      .then((status) => { if (active) setVaultStatus(status); })
      .catch((reason) => {
        if (active) {
          setVaultStatus({ available: false, exists: false, platform: "web", protection: "unavailable" });
          setError(errorMessage(reason));
        }
      });
    return () => { active = false; };
  }, [vault]);

  const lockWallet = useCallback(() => {
    lockEpoch.current += 1;
    setUnlocked(false);
    setConnection(null);
    setNetworkStatus(null);
    setHistory(null);
    setLocalOutgoing([]);
    setNetworkError("");
    setWalletSheet(null);
    setRecoveryPhrase("");
    setPrepared(null);
    setSubmitResult(null);
    setSendStep("compose");
    setError("");
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let disposed = false;
      let listener: PluginListenerHandle | undefined;
      const listenerPromise = Capacitor.getPlatform() === "ios"
        ? CapacitorApp.addListener("pause", lockWallet)
        : CapacitorApp.addListener("appStateChange", ({ isActive }) => {
          if (!isActive && !scannerInFlight.current) lockWallet();
        });
      void listenerPromise.then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      });
      return () => {
        disposed = true;
        if (listener) void listener.remove();
      };
    }

    const lockWhenHidden = () => {
      if (document.visibilityState !== "visible") lockWallet();
    };
    document.addEventListener("visibilitychange", lockWhenHidden);
    return () => document.removeEventListener("visibilitychange", lockWhenHidden);
  }, [lockWallet]);

  const hasWallet = Boolean(vaultStatus?.exists);
  const address = vaultStatus?.address ?? "";
  const balanceSompi = networkStatus?.balance_sompi ?? "0";
  const spendableSompi = networkStatus?.spendable_sompi ?? balanceSompi;
  const maturingSompi = networkStatus?.maturing_sompi ?? "0";
  const hasSpendableFunds = BigInt(spendableSompi || "0") > 0n;
  const hasMaturingFunds = BigInt(maturingSompi || "0") > 0n;
  const walletReady = Boolean(networkStatus?.synced && (networkStatus.spend_ready ?? true) && !networkStatus.missing_history);
  const activityRows = [
    ...(history?.rows ?? []).map((row) => ({
      ...row,
      amountSompi: String(row.amountSompi),
      feeSompi: String(row.feeSompi),
      source: "service" as const,
    })),
    ...localOutgoing.map((row) => ({ ...row, daaScore: 0, source: "local" as const })),
  ]
    .filter((row, index, rows) => rows.findIndex((candidate) => candidate.txid === row.txid) === index)
    .sort((left, right) => right.timestamp - left.timestamp);

  const refreshWallet = useCallback(async (wallet: WalletConnection, registerIfMissing = true) => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    const epoch = lockEpoch.current;
    setSyncing(true);
    try {
      let status = await network.status(wallet.walletToken);
      if (epoch !== lockEpoch.current) return;
      if (!status.has_wallet && registerIfMissing) {
        const watched = await network.watch(wallet);
        if (epoch !== lockEpoch.current) return;
        if (watched.address !== wallet.address) throw new Error("The wallet service derived a different address. Connection stopped.");
        status = await network.status(wallet.walletToken);
        if (epoch !== lockEpoch.current) return;
      }
      if (status.address && status.address !== wallet.address) {
        throw new Error("The wallet service is connected to a different address. Connection stopped.");
      }
      setNetworkStatus(status);
      if (status.has_wallet) {
        try {
          const nextHistory = await network.history(wallet.walletToken);
          if (epoch === lockEpoch.current) setHistory(nextHistory);
        }
        catch { /* Balance remains usable when optional history is unavailable. */ }
      }
      setNetworkError("");
    } catch (reason) {
      setNetworkError(errorMessage(reason));
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  }, [network]);

  useEffect(() => {
    setLocalOutgoing(unlocked && address ? outgoingHistory.load(address) : []);
  }, [address, outgoingHistory, unlocked]);

  useEffect(() => {
    if (!unlocked || !connection) return;
    void refreshWallet(connection);
    const timer = globalThis.setInterval(() => void refreshWallet(connection, false), 10_000);
    return () => clearInterval(timer);
  }, [connection, refreshWallet, unlocked]);

  useEffect(() => {
    if (screenContent.current) screenContent.current.scrollTop = 0;
  }, [tab]);

  function resetSensitiveSetup() {
    setDraft(null);
    setRestoreInput("");
    setChallenge([]);
    setAnswers(["", "", ""]);
    setError("");
  }

  function closeSetup() {
    if (setupStep === "saving" || setupStep === "creating") return;
    setSetupStep(null);
    resetSensitiveSetup();
  }

  function challengeFor(mnemonic: string) {
    const count = normalizeMnemonic(mnemonic).split(" ").length;
    setChallenge(confirmationPositions ?? pickConfirmationPositions(count));
    setAnswers(["", "", ""]);
  }

  async function createWallet() {
    setError("");
    setSetupStep("creating");
    try {
      const generated = await signer.generateMnemonicWallet("mainnet");
      const mnemonic = normalizeMnemonic(generated.mnemonic);
      const derived = await signer.accountAddress(mnemonic, "mainnet", 0);
      if (derived !== generated.address || !derived.startsWith("zkas:")) {
        throw new Error("The official signer returned inconsistent wallet information.");
      }
      setDraft({ mnemonic, address: derived, source: "created" });
      setSetupStep("phrase");
    } catch (reason) {
      setError(errorMessage(reason));
      setSetupStep("choose");
    }
  }

  async function prepareRestore() {
    setError("");
    setBusy(true);
    const mnemonic = normalizeMnemonic(restoreInput);
    try {
      if (mnemonic.split(" ").length !== 12 || !(await signer.isValidMnemonic(mnemonic))) {
        throw new Error("That is not a valid 12-word ZKAS recovery phrase. Check every word and try again.");
      }
      const derived = await signer.accountAddress(mnemonic, "mainnet", 0);
      if (!derived.startsWith("zkas:")) throw new Error("The phrase did not derive a valid ZKAS address.");
      setDraft({ mnemonic, address: derived, source: "restored" });
      challengeFor(mnemonic);
      setRestoreInput("");
      setSetupStep("confirm");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function beginConfirmation() {
    if (!draft) return;
    challengeFor(draft.mnemonic);
    setSetupStep("confirm");
  }

  async function saveConfirmedWallet() {
    if (!draft) return;
    setError("");
    if (!confirmationMatches(draft.mnemonic, challenge, answers)) {
      setError("One or more words do not match. Check your written recovery phrase and try again.");
      return;
    }
    setSetupStep("saving");
    try {
      const accountSeed = await signer.accountSeedHex(draft.mnemonic, 0);
      const viewingKey = await signer.fvkHex(accountSeed);
      const walletToken = createWalletToken();
      let birthdayDaa = 0;
      if (draft.source === "created") {
        try { birthdayDaa = Math.max(0, (await network.status(walletToken)).daa_score || 0); }
        catch { /* Genesis fallback preserves completeness if the service is temporarily offline. */ }
      }
      const saved = await vault.save({
        mnemonic: draft.mnemonic,
        address: draft.address,
        accountSeedHex: accountSeed,
        fvkHex: viewingKey,
        walletToken,
        birthdayDaa,
      });
      setVaultStatus({
        available: true, exists: true,
        platform: vaultStatus?.platform ?? "ios",
        protection: vaultStatus?.protection ?? "device-authentication",
        address: saved.address,
      });
      lockWallet();
      setSetupStep(null);
      resetSensitiveSetup();
    } catch (reason) {
      setError(errorMessage(reason));
      setSetupStep("confirm");
    }
  }

  async function unlockWallet() {
    setBusy(true);
    setError("");
    try {
      const result = await vault.unlock();
      if (address && result.address !== address) throw new Error("Vault address verification failed.");
      setConnection(result);
      setUnlocked(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removeWallet() {
    if (removeText !== "DELETE") return;
    setBusy(true);
    setError("");
    try {
      const result = await vault.remove();
      if (!result.removed) throw new Error("The vault did not confirm removal.");
      if (address) outgoingHistory.removeWallet(address);
      lockWallet();
      setVaultStatus((current) => ({
        available: current?.available ?? true, exists: false,
        platform: current?.platform ?? "ios",
        protection: current?.protection ?? "device-authentication",
      }));
      setRemoveOpen(false);
      setRemoveText("");
      setTab("home");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function openSend(recipient = "") {
    setError("");
    setSendStep("compose");
    setSendTo(recipient);
    setSendAmount("");
    setPrepared(null);
    setSubmitResult(null);
    setWalletSheet("send");
  }

  async function scanRecipient() {
    if (!unlocked || scanning) return;
    setError("");
    scannerInFlight.current = true;
    setScanning(true);
    try {
      const scanned = await scanner.scanAddress();
      if (!scanned) return;
      if (!isMainnetAddress(scanned)) {
        throw new Error("That QR code does not contain a complete ZKAS mainnet address.");
      }
      openSend(scanned);
    } catch (reason) {
      const message = errorMessage(reason);
      if (!/cancel(?:led|ed)?/i.test(message)) setError(message);
    } finally {
      scannerInFlight.current = false;
      setScanning(false);
    }
  }

  async function prepareSend() {
    if (!connection) return;
    setError("");
    const amount = parseZkasAmount(sendAmount);
    if (!isMainnetAddress(sendTo)) {
      setError("Enter a complete ZKAS mainnet address beginning with zkas:.");
      return;
    }
    if (!amount) {
      setError("Enter a positive ZKAS amount with no more than 8 decimal places.");
      return;
    }
    if (amount > BigInt(spendableSompi || "0")) {
      setError("That amount is greater than the currently spendable balance, before the network fee.");
      return;
    }
    setSendStep("preparing");
    try {
      const payment = await network.prepare(connection, sendTo, amount);
      setPrepared(payment);
      setSendStep("review");
    } catch (reason) {
      setError(errorMessage(reason));
      setSendStep("compose");
    }
  }

  async function authorizeAndSend() {
    if (!connection || !prepared) return;
    setError("");
    setSendStep("signing");
    try {
      const authorization = await vault.authorize();
      if (authorization.address !== connection.address) throw new Error("Device authorization returned a different wallet.");
      const sigs = await network.sign(authorization.accountSeedHex, prepared);
      const result = await network.submit(connection.walletToken, prepared.session, sigs);
      setSubmitResult({
        txid: result.txid,
        amount_sompi: Number(prepared.amountSompi),
        fee_sompi: Number(prepared.feeSompi),
      });
      setLocalOutgoing(outgoingHistory.add({
        kind: "sent",
        txid: result.txid,
        walletAddress: connection.address,
        recipient: prepared.to,
        amountSompi: prepared.amountSompi.toString(),
        feeSompi: prepared.feeSompi.toString(),
        timestamp: Date.now(),
      }));
      setSendStep("success");
      await refreshWallet(connection, false);
    } catch (reason) {
      setPrepared(null);
      setError(errorMessage(reason));
      setSendStep("compose");
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy was blocked. Press and hold the address to copy it manually.");
    }
  }

  async function revealRecoveryPhrase() {
    setBusy(true);
    setError("");
    setRecoveryPhrase("");
    try {
      const recovery = await vault.revealRecovery();
      if (recovery.address !== address) throw new Error("Device authentication returned a different wallet.");
      setRecoveryPhrase(recovery.mnemonic);
      setWalletSheet("recovery");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function closeRecoveryPhrase() {
    setRecoveryPhrase("");
    setWalletSheet(null);
    setError("");
  }

  const statusLabel = !unlocked ? "Authentication required"
    : !networkStatus ? "Connecting to ZKAS mainnet"
    : networkStatus?.missing_history ? "History incomplete — do not spend"
    : networkStatus?.loading ? "Loading wallet"
    : !networkStatus?.node_connected ? "Mainnet service offline"
    : walletReady && !hasSpendableFunds && hasMaturingFunds ? "Change maturing · not yet spendable"
    : networkStatus.synced ? (walletReady ? "Ready on ZKAS mainnet" : "Synced · preparing spend state")
    : "Synchronizing mainnet";
  const hasUnlistedFunds = unlocked && activityRows.length === 0 && BigInt(balanceSompi || "0") > 0n;

  return (
    <main className="page-shell">
      <section className="wallet-frame" aria-label="Stream Wallet mainnet app">
        <header className="app-header">
          <div className="brand-mark" aria-hidden="true">S</div>
          <div className="brand-copy"><strong>Stream Wallet</strong><span>Non-custodial ZKAS wallet</span></div>
          <span className="prototype-pill live">MAINNET</span>
        </header>

        <div className="safety-banner live" role="status">
          <ShieldCheck size={18} aria-hidden="true" />
          <span><strong>Live ZKAS mainnet.</strong> During the pilot, fund this wallet with only 1–2 ZKAS and verify recovery before adding more.</span>
        </div>
        {(error || networkError) && setupStep === null && !removeOpen && walletSheet === null && <div className="global-error" role="alert">{error || networkError}</div>}

        <div className="screen-content" ref={screenContent}>
          {tab === "home" && (
            <>
              <section className="balance-card">
                <div className="balance-heading">
                  <span>{hasWallet ? (unlocked ? "Spendable balance" : "Wallet locked") : "Wallet balance"}</span>
                  <button className="icon-button" type="button" onClick={() => setBalanceVisible((value) => !value)} aria-label={balanceVisible ? "Hide balance" : "Show balance"}>{balanceVisible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
                </div>
                <strong className="balance-value">{balanceVisible ? `${formatSompi(spendableSompi, 8)} ZKAS` : "••••••"}</strong>
                <span className="balance-fiat">{unlocked && networkStatus ? `${formatSompi(balanceSompi)} total · ${formatSompi(maturingSompi)} maturing` : "ZKAS mainnet"}</span>
                <div className={`balance-status ${walletReady ? "ready" : ""}`}><span /> {statusLabel}</div>
                {unlocked && address && <div className="address-preview"><span>Account 0</span><strong title={address}>{shortAddress(address)}</strong></div>}
              </section>

              <div className="quick-actions" aria-label="Wallet actions">
                <button type="button" disabled={!unlocked} onClick={() => { setError(""); setWalletSheet("receive"); }}><span><ArrowDownLeft size={20} /></span>Receive</button>
                <button type="button" disabled={!unlocked || !walletReady || !hasSpendableFunds} onClick={() => openSend()}><span><ArrowUpRight size={20} /></span>Send</button>
                <button type="button" disabled={!unlocked || scanning} onClick={scanRecipient}><span>{scanning ? <LoaderCircle className="spin" size={20} /> : <ScanLine size={20} />}</span>Scan</button>
              </div>

              {!hasWallet && (
                <>
                  <button className="primary-action" type="button" disabled={!vaultStatus?.available} onClick={() => { resetSensitiveSetup(); setSetupStep("choose"); }}>Create or restore wallet <ChevronRight size={19} /></button>
                  {vaultStatus && !vaultStatus.available && <p className="native-note">Secure setup requires the installed iPhone or Android app with device authentication enabled.</p>}
                </>
              )}
              {hasWallet && !unlocked && <button className="primary-action" type="button" disabled={busy} onClick={unlockWallet}>{busy ? <LoaderCircle className="spin" size={19} /> : <Fingerprint size={19} />} Unlock wallet</button>}
              {hasWallet && unlocked && <button className="secondary-action" type="button" onClick={lockWallet}><LockKeyhole size={18} /> Lock wallet</button>}

              <section className="insight-card">
                <div className="section-title"><div><span className="eyebrow">MAINNET STATUS</span><h2>Private, device-authorized wallet</h2></div>{syncing ? <RefreshCw className="spin" size={22} /> : <ShieldCheck size={22} aria-hidden="true" />}</div>
                <div className="metric-grid"><div><span>Vault</span><strong>{hasWallet ? "Encrypted" : "Not created"}</strong></div><div><span>Network</span><strong>{networkStatus?.node_connected ? "Connected" : unlocked ? "Checking" : "Locked"}</strong></div></div>
                <p>Your recovery phrase and spending key remain encrypted on this device. The hosted ZKAS service receives a viewing key, so it can see this wallet’s balance and history but cannot spend funds.</p>
              </section>
            </>
          )}

          {tab === "activity" && (
            <section className="activity-view">
              <span className="eyebrow">MAINNET ACTIVITY</span><h1>Wallet history</h1>
              <div className="history-notice"><strong>Outgoing transactions only</strong><span>Payments sent from this device after this update are saved here. Incoming transaction details are unavailable until the hosted ZKAS service provides itemized history.</span></div>
              {!unlocked && <div className="empty-state"><Activity size={36} /><h2>Unlock to view</h2><p>History is private wallet data and is cleared from the screen when the app locks.</p></div>}
              {unlocked && activityRows.length === 0 && <div className="empty-state"><Activity size={36} /><h2>{hasUnlistedFunds ? "Balance detected" : "No outgoing activity yet"}</h2><p>{syncing ? "The wallet is synchronizing." : hasUnlistedFunds ? `${formatSompi(balanceSompi)} ZKAS is visible in this wallet. Incoming itemized records are not currently available.` : "Payments sent from this device will appear here."}</p></div>}
              {unlocked && activityRows.length > 0 && <div className="history-list">{activityRows.slice(0, 25).map((row) => <article key={`${row.txid}-${row.kind}`}><span className={`history-icon ${row.kind}`}><ArrowDownLeft /></span><div><strong>{row.kind === "sent" ? "Sent" : row.kind === "coinbase" ? "Mined" : "Received"}</strong><small>{row.timestamp > 0 ? new Date(row.timestamp).toLocaleString() : `DAA ${row.daaScore}`}</small><small>{row.kind === "sent" && row.source === "local" ? `Fee ${formatSompi(row.feeSompi)} ZKAS · saved on this device` : row.txid}</small></div><b>{row.kind === "sent" ? "−" : "+"}{formatSompi(row.amountSompi)} ZKAS</b></article>)}</div>}
            </section>
          )}

          {tab === "security" && (
            <section className="security-view">
              <span className="eyebrow">SECURITY CENTER</span><h1>Your keys stay with you</h1>
              <div className="security-list">
                <article><Fingerprint /><div><strong>Device authentication</strong><span>Face ID, fingerprint or the device passcode protects the encryption key.</span></div></article>
                <article><LockKeyhole /><div><strong>Portable recovery</strong><span>The 12 official ZKAS words restore account 0 in a compatible wallet.</span></div></article>
                <article><ShieldCheck /><div><strong>Verified payments</strong><span>The pinned signer checks recipient, amount, change and fee before any mainnet signature.</span></div></article>
              </div>
              <div className="privacy-disclosure"><strong>Hosted-service privacy</strong><span>wallet.zkas.info receives the full viewing key and a random wallet token. It can observe this wallet’s balance and activity, but never receives spend authority.</span></div>
              {hasWallet && <div className="vault-controls"><button className="secondary-action" type="button" onClick={revealRecoveryPhrase} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />} View recovery phrase</button><button className="secondary-action" type="button" onClick={unlocked ? lockWallet : unlockWallet} disabled={busy}>{unlocked ? <LockKeyhole size={18} /> : <Fingerprint size={18} />} {unlocked ? "Lock wallet" : "Unlock wallet"}</button><button className="danger-action" type="button" onClick={() => { setError(""); setRemoveOpen(true); }}><Trash2 size={18} /> Remove wallet from device</button></div>}
            </section>
          )}
        </div>

        <nav className="bottom-nav" aria-label="Primary">
          <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}><Home /><span>Home</span></button>
          <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}><Activity /><span>Activity</span></button>
          <button className={tab === "security" ? "active" : ""} onClick={() => setTab("security")}><ShieldCheck /><span>Security</span></button>
        </nav>

        {setupStep && (
          <div className="modal-backdrop"><section className="setup-sheet" role="dialog" aria-modal="true" aria-labelledby="setup-title">
            <div className="sheet-header">
              {setupStep === "confirm" ? <button className="sheet-nav" type="button" aria-label="Go back" onClick={() => { setError(""); setSetupStep(draft?.source === "created" ? "phrase" : "restore"); }}><ChevronLeft /></button> : <span />}
              <div className="sheet-handle" />
              <button className="sheet-nav" type="button" aria-label="Close secure setup" disabled={setupStep === "creating" || setupStep === "saving"} onClick={closeSetup}><X /></button>
            </div>
            {setupStep === "choose" && <><div className="setup-icon"><WalletCards /></div><span className="eyebrow">ZKAS MAINNET</span><h2 id="setup-title">Start your Stream Wallet</h2><p>Create new recovery words or restore existing official ZKAS words. This wallet connects to live mainnet; start with only 1–2 ZKAS.</p><div className="setup-choices"><button type="button" onClick={createWallet}><KeyRound /><span><strong>Create new wallet</strong><small>Generate 12 words on this device</small></span><ChevronRight /></button><button type="button" onClick={() => { setError(""); setSetupStep("restore"); }}><WalletCards /><span><strong>Restore wallet</strong><small>Use an existing 12-word phrase</small></span><ChevronRight /></button></div></>}
            {setupStep === "creating" && <LoadingStep title="Creating on this device" text="The pinned official ZKAS signer is generating your recovery phrase." />}
            {setupStep === "phrase" && draft && <><span className="eyebrow">WRITE DOWN EVERY WORD</span><h2 id="setup-title">Your recovery phrase</h2><div className="seed-warning"><ShieldCheck /> Anyone with these words controls the wallet. Keep them offline and private.</div><ol className="word-grid">{draft.mnemonic.split(" ").map((word, index) => <li key={`${word}-${index}`}><span>{index + 1}</span>{word}</li>)}</ol><div className="derived-address"><span>Official account 0 address</span><strong>{shortAddress(draft.address)}</strong></div><button className="primary-action" type="button" onClick={beginConfirmation}>I wrote these words down <ChevronRight size={18} /></button></>}
            {setupStep === "restore" && <><span className="eyebrow">RESTORE ACCOUNT 0</span><h2 id="setup-title">Enter 12 recovery words</h2><p>Processing stays on this device. A restored wallet may need a longer mainnet scan from genesis.</p><label className="field-label" htmlFor="restore-phrase">Recovery phrase</label><textarea id="restore-phrase" value={restoreInput} onChange={(event) => setRestoreInput(event.target.value)} rows={5} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="word 1  word 2  …  word 12" /><p className="word-count">{normalizeMnemonic(restoreInput) ? normalizeMnemonic(restoreInput).split(" ").length : 0} of 12 words</p>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-action" type="button" disabled={busy || !restoreInput.trim()} onClick={prepareRestore}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />} Validate and continue</button></>}
            {setupStep === "confirm" && draft && <><span className="eyebrow">BACKUP CHECK</span><h2 id="setup-title">Confirm your recovery phrase</h2><p>Enter the requested words from your written backup. Nothing is saved until all three match.</p><div className="confirmation-fields">{challenge.map((position, index) => <label key={position}>Word {position + 1}<input value={answers[index] ?? ""} onChange={(event) => setAnswers((current) => current.map((value, answerIndex) => answerIndex === index ? event.target.value : value))} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} /></label>)}</div><div className="derived-address"><span>{draft.source === "restored" ? "Restored" : "New"} account 0 address</span><strong>{shortAddress(draft.address)}</strong></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-action" type="button" disabled={answers.some((answer) => !answer.trim())} onClick={saveConfirmedWallet}><Fingerprint size={18} /> Confirm and encrypt</button></>}
            {setupStep === "saving" && <LoadingStep title="Encrypting your vault" text="Approve the device authentication prompt. Stream Wallet stores no server copy." />}
          </section></div>
        )}

        {walletSheet === "receive" && <div className="modal-backdrop"><section className="setup-sheet" role="dialog" aria-modal="true" aria-labelledby="receive-title"><SheetClose onClose={() => setWalletSheet(null)} /><div className="setup-icon"><ArrowDownLeft /></div><span className="eyebrow">RECEIVE ON MAINNET</span><h2 id="receive-title">Your ZKAS address</h2><p>Your complete receiving address is displayed below. Tap the address or the Copy button, then verify its first and last characters before sending.</p><button className="full-address" type="button" onClick={copyAddress}>{address}</button>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-action" type="button" onClick={copyAddress}>{copied ? <Check size={18} /> : <Copy size={18} />} {copied ? "Address copied" : "Copy full address"}</button></section></div>}

        {walletSheet === "recovery" && recoveryPhrase && <div className="modal-backdrop"><section className="setup-sheet" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><SheetClose onClose={closeRecoveryPhrase} /><span className="eyebrow">PRIVATE WALLET BACKUP</span><h2 id="recovery-title">Your recovery phrase</h2><div className="seed-warning"><ShieldCheck /> Anyone who sees these words can take every ZKAS in this wallet. Keep them offline and never share a screenshot.</div><ol className="word-grid">{recoveryPhrase.split(" ").map((word, index) => <li key={`${word}-${index}`}><span>{index + 1}</span>{word}</li>)}</ol><p>Confirm that your written backup matches these 12 words in this exact order.</p><button className="primary-action" type="button" onClick={closeRecoveryPhrase}><Check size={18} /> I verified my backup</button></section></div>}

        {walletSheet === "send" && <div className="modal-backdrop"><section className="setup-sheet" role="dialog" aria-modal="true" aria-labelledby="send-title"><SheetClose disabled={sendStep === "preparing" || sendStep === "signing"} onClose={() => { setWalletSheet(null); setError(""); }} />
          {sendStep === "compose" && <><span className="eyebrow">LIVE MAINNET PAYMENT</span><h2 id="send-title">Send ZKAS</h2><p>Available: {formatSompi(spendableSompi)} ZKAS. The network fee is calculated before you approve the payment.</p><label className="field-label" htmlFor="send-address">Recipient address</label><textarea id="send-address" value={sendTo} onChange={(event) => { setSendTo(event.target.value.trim()); setError(""); }} rows={3} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="zkas:…" /><label className="field-label" htmlFor="send-amount">Amount in ZKAS</label><input id="send-amount" className="text-input" inputMode="decimal" value={sendAmount} onChange={(event) => { setSendAmount(event.target.value.replace(/[^0-9.]/g, "")); setError(""); }} placeholder="1.00" />{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-action" type="button" disabled={!sendTo || !sendAmount} onClick={prepareSend}>Calculate fee and review <ChevronRight size={18} /></button></>}
          {sendStep === "preparing" && <LoadingStep title="Preparing private payment" text="The viewing service is building the unsigned proof. No spend key has been released." />}
          {sendStep === "review" && prepared && <><span className="eyebrow">FINAL REVIEW</span><h2 id="send-title">Check every detail</h2><div className="payment-review"><div><span>Recipient</span><strong className="review-address">{prepared.to}</strong></div><div><span>Amount</span><strong>{formatSompi(prepared.amountSompi)} ZKAS</strong></div><div><span>Network fee</span><strong>{formatSompi(prepared.feeSompi)} ZKAS</strong></div><div><span>Total leaving wallet</span><strong>{formatSompi(prepared.amountSompi + prepared.feeSompi)} ZKAS</strong></div></div><div className="seed-warning"><ShieldCheck /> Device authentication releases account 0 only long enough to verify and sign this exact payment.</div>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-action" type="button" onClick={authorizeAndSend}><Fingerprint size={18} /> Authenticate and broadcast</button><button className="secondary-action" type="button" onClick={() => { setPrepared(null); setSendStep("compose"); }}>Go back without signing</button></>}
          {sendStep === "signing" && <LoadingStep title="Verifying and broadcasting" text="Stream Wallet is checking recipient, amount, change and fee before signing on this device." />}
          {sendStep === "success" && submitResult && <><div className="setup-icon success"><Check /></div><span className="eyebrow">BROADCAST TO MAINNET</span><h2 id="send-title">Payment sent</h2><div className="payment-review"><div><span>Amount</span><strong>{formatSompi(submitResult.amount_sompi)} ZKAS</strong></div><div><span>Network fee</span><strong>{formatSompi(submitResult.fee_sompi)} ZKAS</strong></div><div><span>Transaction ID</span><strong className="review-address">{submitResult.txid}</strong></div></div><button className="primary-action" type="button" onClick={() => { setWalletSheet(null); setError(""); }}>Done</button></>}
        </section></div>}

        {removeOpen && <div className="modal-backdrop"><section className="setup-sheet" role="dialog" aria-modal="true" aria-labelledby="remove-title"><SheetClose disabled={busy} onClose={() => { setRemoveOpen(false); setRemoveText(""); setError(""); }} /><div className="setup-icon danger"><Trash2 /></div><span className="eyebrow danger-text">PERMANENT DEVICE REMOVAL</span><h2 id="remove-title">Remove this wallet?</h2><p>This deletes the encrypted vault and its device key. The wallet can only be recovered with the 12-word phrase.</p><label className="field-label" htmlFor="delete-confirmation">Type DELETE to continue</label><input id="delete-confirmation" className="text-input" value={removeText} onChange={(event) => setRemoveText(event.target.value)} autoComplete="off" />{error && <div className="form-error" role="alert">{error}</div>}<button className="danger-confirm" type="button" disabled={busy || removeText !== "DELETE"} onClick={removeWallet}>{busy ? <LoaderCircle className="spin" size={18} /> : <Trash2 size={18} />} Authenticate and remove</button></section></div>}
      </section>
    </main>
  );
}

function SheetClose({ onClose, disabled = false }: { onClose: () => void; disabled?: boolean }) {
  return <div className="sheet-header"><span /><div className="sheet-handle" /><button className="sheet-nav" type="button" aria-label="Close" disabled={disabled} onClick={onClose}><X /></button></div>;
}

function LoadingStep({ title, text }: { title: string; text: string }) {
  return <div className="loading-step"><LoaderCircle className="spin" /><h2 id="setup-title">{title}</h2><p>{text}</p></div>;
}
