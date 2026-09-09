export interface LocalOutgoingRecord {
  kind: "sent";
  txid: string;
  walletAddress: string;
  recipient: string;
  amountSompi: string;
  feeSompi: string;
  timestamp: number;
}

export interface LocalOutgoingHistoryApi {
  load(walletAddress: string): LocalOutgoingRecord[];
  add(record: LocalOutgoingRecord): LocalOutgoingRecord[];
  removeWallet(walletAddress: string): void;
}

const STORAGE_KEY = "stream.wallet.outgoing-history.v1";
const MAX_RECORDS = 100;

function validRecord(value: unknown): value is LocalOutgoingRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.kind === "sent"
    && typeof record.txid === "string" && /^[0-9a-f]{64}$/i.test(record.txid)
    && typeof record.walletAddress === "string" && record.walletAddress.startsWith("zkas:")
    && typeof record.recipient === "string" && record.recipient.startsWith("zkas:")
    && typeof record.amountSompi === "string" && /^\d+$/.test(record.amountSompi)
    && typeof record.feeSompi === "string" && /^\d+$/.test(record.feeSompi)
    && typeof record.timestamp === "number" && Number.isFinite(record.timestamp) && record.timestamp > 0;
}

function readAll(): LocalOutgoingRecord[] {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(validRecord) : [];
  } catch {
    return [];
  }
}

function writeAll(records: LocalOutgoingRecord[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    // A successful broadcast is not reversed if optional device history cannot be saved.
  }
}

export const localOutgoingHistory: LocalOutgoingHistoryApi = {
  load(walletAddress) {
    return readAll()
      .filter((record) => record.walletAddress === walletAddress)
      .sort((left, right) => right.timestamp - left.timestamp);
  },
  add(record) {
    const records = [record, ...readAll().filter((current) => current.txid !== record.txid)];
    writeAll(records);
    return records
      .filter((current) => current.walletAddress === record.walletAddress)
      .sort((left, right) => right.timestamp - left.timestamp);
  },
  removeWallet(walletAddress) {
    writeAll(readAll().filter((record) => record.walletAddress !== walletAddress));
  },
};
