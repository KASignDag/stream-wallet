import { verifyAndSignPayment } from "../signer";

export const MAINNET_DAEMON = "https://wallet.zkas.info/daemon";
export const SOMPI_PER_ZKAS = 100_000_000n;

export interface WalletConnection {
  address: string;
  fvkHex: string;
  walletToken: string;
  birthdayDaa: number;
}

export interface WalletStatus {
  has_wallet: boolean;
  address: string | null;
  network: string;
  node_connected: boolean;
  daa_score: number;
  synced: boolean;
  warming?: boolean;
  spend_ready?: boolean;
  loading?: boolean;
  missing_history?: boolean;
  watch_only?: boolean;
  scanned_blocks: number;
  chain_len: number;
  balance_sompi: string;
  balance_fc: string;
  spendable_sompi?: string;
  maturing_sompi?: string;
  pending_in_sompi?: string;
  pending_out_sompi?: string;
  note_count: number;
  updated_unix: number;
  error: string | null;
}

export interface HistoryRow {
  kind: "coinbase" | "received" | "sent";
  txid: string;
  daaScore: number;
  timestamp: number;
  amountSompi: number;
  amountZkas: number;
  feeSompi: number;
  recipient?: string | null;
  memo?: string | null;
}

export interface WalletHistory {
  recoverableHistory: boolean;
  total: number;
  rows: HistoryRow[];
}

interface PrepareResponse {
  session: string;
  amount_sompi: number;
  fee_sompi: number;
  remaining_sompi?: number;
  amount_sompi_exact?: string;
  fee_sompi_exact?: string;
  remaining_sompi_exact?: string;
  spend_auth: { index: number; alpha: string }[];
  bundle_hex: string;
  disclosure: {
    spend_value: number;
    out_value: number;
    out_recipient: string;
    out_rseed: string;
    rcv: string;
  }[];
}

export interface PreparedPayment {
  session: string;
  to: string;
  amountSompi: bigint;
  feeSompi: bigint;
  spendCount: number;
  bundleHex: string;
  disclosure: PrepareResponse["disclosure"];
  spendAuth: PrepareResponse["spend_auth"];
}

export interface SubmitResult {
  txid: string;
  amount_sompi: number;
  fee_sompi: number;
}

const ACTION_BYTES = 32 * 5 + 580 + 80 + 64;
const PROOF_FIXED = 2_720;
const PROOF_PER_ACTION = 2_272;
const BUNDLE_HEADER = 117;
const ENVELOPE_BYTES = 128;
const BYTE_TO_MASS = 4;
const RELAY_FEE_PER_KG = 100_000;

/** Mirrors the current official wallet's byte-priced mainnet relay-fee calculation. */
export function minRelayFeeForSpends(spends: number): bigint {
  const actions = Math.max(spends, 2);
  const wireBytes = BUNDLE_HEADER + actions * ACTION_BYTES + PROOF_FIXED + PROOF_PER_ACTION * actions;
  const pricedBytes = wireBytes + ENVELOPE_BYTES;
  return BigInt(Math.floor((Math.floor((pricedBytes * BYTE_TO_MASS) / 2) * RELAY_FEE_PER_KG) / 1000));
}

export function parseZkasAmount(value: string): bigint | null {
  const clean = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  const sompi = BigInt(whole) * SOMPI_PER_ZKAS + BigInt(fraction.padEnd(8, "0"));
  return sompi > 0n ? sompi : null;
}

export function formatSompi(value: string | bigint | number, maximumFractionDigits = 8): string {
  const sompi = typeof value === "bigint" ? value : BigInt(value || 0);
  const whole = sompi / SOMPI_PER_ZKAS;
  const fraction = (sompi % SOMPI_PER_ZKAS).toString().padStart(8, "0").replace(/0+$/, "");
  if (!fraction || maximumFractionDigits === 0) return whole.toLocaleString("en-US");
  return `${whole.toLocaleString("en-US")}.${fraction.slice(0, maximumFractionDigits)}`;
}

export function createWalletToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function request<T>(token: string, path: string, method = "GET", body?: unknown, timeoutMs = 15_000): Promise<T> {
  if (!/^[0-9a-f]{32}$/.test(token)) throw new Error("The encrypted wallet connection token is invalid.");
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${MAINNET_DAEMON}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "X-Wallet-Token": token,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    if (text) {
      try { data = JSON.parse(text) as Record<string, unknown>; }
      catch { throw new Error(`The ZKAS wallet service returned an invalid response (${response.status}).`); }
    }
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : `The ZKAS wallet service returned ${response.status}.`);
    }
    return data as T;
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("The ZKAS wallet service timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const mainnetApi = {
  status: (token: string) => request<WalletStatus>(token, "/api/status"),
  watch: (connection: WalletConnection) => request<{ address: string }>(
    connection.walletToken,
    "/api/wallet/watch",
    "POST",
    { fvk_hex: connection.fvkHex, birthday: connection.birthdayDaa },
    180_000,
  ),
  history: (token: string) => request<WalletHistory>(token, "/api/wallet/history", "GET", undefined, 30_000),
  prepare: async (connection: WalletConnection, to: string, amountSompi: bigint): Promise<PreparedPayment> => {
    const prepared = await request<PrepareResponse>(
      connection.walletToken,
      "/api/wallet/prepare",
      "POST",
      { fvk_hex: connection.fvkHex, to: to.trim(), amount_sompi: amountSompi.toString(), allow_partial: false },
      300_000,
    );
    const amount = BigInt(prepared.amount_sompi_exact ?? Math.round(prepared.amount_sompi));
    const fee = BigInt(prepared.fee_sompi_exact ?? Math.round(prepared.fee_sompi));
    const remaining = BigInt(prepared.remaining_sompi_exact ?? Math.round(prepared.remaining_sompi ?? 0));
    if (amount !== amountSompi || remaining !== 0n) {
      throw new Error("The wallet service did not prepare the exact requested amount. Nothing was signed.");
    }
    if (!prepared.spend_auth.length) throw new Error("The prepared payment contains no authorized spends.");
    const feeCeiling = minRelayFeeForSpends(prepared.spend_auth.length) * 2n;
    if (fee <= 0n || fee > feeCeiling) {
      throw new Error(`The prepared network fee is outside Stream Wallet's safety limit. Nothing was signed.`);
    }
    return {
      session: prepared.session,
      to: to.trim(),
      amountSompi: amount,
      feeSompi: fee,
      spendCount: prepared.spend_auth.length,
      bundleHex: prepared.bundle_hex,
      disclosure: prepared.disclosure,
      spendAuth: prepared.spend_auth,
    };
  },
  sign: (accountSeedHex: string, prepared: PreparedPayment) => verifyAndSignPayment(
    accountSeedHex,
    "mainnet",
    prepared.to,
    prepared.amountSompi,
    prepared.feeSompi,
    prepared.bundleHex,
    JSON.stringify(prepared.disclosure),
    JSON.stringify(prepared.spendAuth),
  ),
  submit: (token: string, session: string, sigs: { index: number; sig: string }[]) => request<SubmitResult>(
    token,
    "/api/wallet/submit",
    "POST",
    { session, sigs },
    60_000,
  ),
};
