# Architecture and trust boundaries

## Components

- `src/App.tsx` implements the React user flow and keeps plaintext secrets out
  of persistent web storage.
- `ios/App/App/SecureVaultPlugin.swift` encrypts wallet material with a random
  key protected by iOS Keychain user presence.
- `android/app/src/main/java/stream/zkas/wallet/security/SecureVaultPlugin.java`
  encrypts wallet material with an authentication-bound Android Keystore key.
- `src/signer/` contains the pinned official ZKAS signer WASM used for account
  derivation and independent payment verification/signing.
- `src/network/mainnet.ts` communicates with the configured hosted walletd
  service using a random wallet token and full viewing key.
- `src/history/localOutgoingHistory.ts` stores successful outgoing transaction
  metadata locally, separated by wallet address and capped at 100 records.

## Secret boundary

The recovery phrase and account spending material are encrypted on the device.
The hosted service receives a full viewing key and can observe wallet balances
and activity, but it must never receive the recovery phrase or spending key.
Fresh device authentication authorizes each payment. The pinned signer checks
the prepared recipient, amount, change and maximum fee before signing.

## Hosted-service boundary

The configured `wallet.zkas.info` daemon performs scanning, proof preparation
and broadcasting. It can delay, omit or misreport data, so its balance and
history responses are not an independent source of truth. The on-device signer
is the final protection against altered payment outputs. See
`docs/BACKEND_HISTORY.md` for the optional history behavior and privacy tradeoff.

## Lifecycle boundary

Wallet state is cleared from the React surface when the application enters the
background. The iOS app-switcher preview is obscured, Android screenshots are
blocked, and the scanner is treated as an intentional native presentation
rather than an automatic lock event.

## Build integrity

`scripts/check-signer-inline.mjs` verifies the vendored signer hash and expected
imports before every production build. Both native projects consume the same
audited Vite bundle through Capacitor. Store-signing identities and credentials
are intentionally absent from the repository.
