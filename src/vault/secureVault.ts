import { Capacitor, registerPlugin } from "@capacitor/core";

export interface VaultStatus {
  available: boolean;
  exists: boolean;
  platform: "ios" | "android" | "web";
  protection: string;
  address?: string;
}

export interface VaultSaveResult {
  address: string;
}

export interface VaultUnlockResult {
  address: string;
  fvkHex: string;
  walletToken: string;
  birthdayDaa: number;
}

export interface VaultAuthorizeResult {
  address: string;
  accountSeedHex: string;
}

export interface VaultRecoveryResult {
  address: string;
  mnemonic: string;
}

export interface VaultRemoveResult {
  removed: boolean;
}

export interface SecureVaultApi {
  status(): Promise<VaultStatus>;
  save(options: {
    mnemonic: string;
    address: string;
    accountSeedHex: string;
    fvkHex: string;
    walletToken: string;
    birthdayDaa: number;
  }): Promise<VaultSaveResult>;
  unlock(): Promise<VaultUnlockResult>;
  authorize(): Promise<VaultAuthorizeResult>;
  revealRecovery(): Promise<VaultRecoveryResult>;
  remove(): Promise<VaultRemoveResult>;
}

interface NativeSecureVaultPlugin {
  status(): Promise<VaultStatus>;
  save(options: Parameters<SecureVaultApi["save"]>[0]): Promise<VaultSaveResult>;
  unlock(): Promise<VaultUnlockResult>;
  authorize(): Promise<VaultAuthorizeResult>;
  revealRecovery(): Promise<VaultRecoveryResult>;
  remove(): Promise<VaultRemoveResult>;
}

const NativeSecureVault = registerPlugin<NativeSecureVaultPlugin>("SecureVault");

function nativeOnly(): never {
  throw new Error("Encrypted wallet storage is available only inside the iOS or Android Stream Wallet app.");
}

export const secureVault: SecureVaultApi = {
  async status() {
    if (!Capacitor.isNativePlatform()) {
      return {
        available: false,
        exists: false,
        platform: "web",
        protection: "native-app-required",
      };
    }
    return NativeSecureVault.status();
  },
  async save(options) {
    if (!Capacitor.isNativePlatform()) nativeOnly();
    return NativeSecureVault.save(options);
  },
  async unlock() {
    if (!Capacitor.isNativePlatform()) nativeOnly();
    return NativeSecureVault.unlock();
  },
  async authorize() {
    if (!Capacitor.isNativePlatform()) nativeOnly();
    return NativeSecureVault.authorize();
  },
  async revealRecovery() {
    if (!Capacitor.isNativePlatform()) nativeOnly();
    return NativeSecureVault.revealRecovery();
  },
  async remove() {
    if (!Capacitor.isNativePlatform()) nativeOnly();
    return NativeSecureVault.remove();
  },
};
