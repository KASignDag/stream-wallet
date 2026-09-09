# Stream Wallet

Stream Wallet is a mobile-first, non-custodial community client for ZKAS. It is intended to use the official ZKAS seed format, on-device signer and keyless wallet daemon while offering a simpler everyday payment experience connected to ZKAS.stream.

## Current status

**Version 0.3 live-mainnet pilot — not a public release.**

The current build can generate or restore an official 12-word ZKAS recovery phrase, derive account 0 with the pinned official signer, require a three-word backup check, and encrypt the phrase in a native device vault. The wrapping key is protected by iOS Keychain user presence or an Android Keystore authentication-bound key. Lock, authenticated unlock and authenticated permanent removal are implemented.

The native app connects to the official hosted, viewing-key-only wallet service at `wallet.zkas.info`. It can register the viewing key, synchronize real mainnet balances and history, receive ZKAS, prepare an unsigned payment, show the exact fee, independently verify the prepared bundle with the pinned signer, and broadcast only after fresh device authentication. Partial/chunked delivery is intentionally disabled.

The browser build still cannot create or persist a wallet. An earlier iPhone pilot build was installed successfully and verified Stream-to-official recovery, authenticated lock/unlock, mainnet receiving and balance synchronization. Version 0.3 includes a safe-area correction, updated native dependencies and a Capacitor 8 migration, so it must be rebuilt and regression-tested on a physical iPhone before distribution. Android device testing, send-back, removal/restore, hostile-bundle testing and independent security review remain open. Use a newly generated pilot wallet and no more than 1–2 ZKAS until every device gate is recorded.

## Product rules

1. Stream Wallet never operates a custodial account.
2. The recovery seed never leaves the user's device.
3. Stream Wallet does not invent cryptography, seed formats or address derivation.
4. The daemon receives a full viewing key, never spending authority.
5. The device independently verifies the recipient, amount and maximum fee before signing.
6. A Stream Wallet recovery seed must restore in the official ZKAS wallet.
7. No analytics, advertising SDKs or third-party scripts may run in a signing surface.

## Planned architecture

- **UI:** React + TypeScript, mobile-first
- **Mobile shell:** Capacitor for iOS and Android
- **On-device keys/signing:** official `zkas-signer` WASM
- **Mainnet protocol:** current official walletd watch/prepare/verify/submit flow
- **Scanning/proving/broadcasting:** viewing-key-only `zkas-walletd`
- **Storage:** platform-protected encrypted vault; biometric/PIN unlock
- **Read-only data:** ZKAS.stream network and OTC price APIs, isolated from key operations

See [`docs/RELEASE_GATES.md`](docs/RELEASE_GATES.md) for the conditions required before real funds are enabled.

## Development

Prerequisites are Node.js 22 or newer. Native builds require Xcode 26 or newer for iOS, or JDK 21 and Android Studio for Android.

```bash
npm install
npm run dev
npm test
npm run build
npm run mobile:sync
```

The native application identifier is `stream.zkas.wallet`. Android and iOS
projects are generated from this same audited web bundle through Capacitor.

Native builds require Android Studio/Gradle or macOS with Xcode and CocoaPods. Before the 1–2 ZKAS pilot, complete the [`device compatibility test`](docs/DEVICE_COMPATIBILITY_TEST.md), then follow the [`mainnet pilot`](docs/MAINNET_PILOT.md). Do not treat the pilot build as ready for public deposits.

Publisher preparation is documented in [`docs/PUBLISHER_HANDOFF.md`](docs/PUBLISHER_HANDOFF.md). The project privacy notice is in [`PRIVACY.md`](PRIVACY.md), and exact verified/pending test results are recorded in [`docs/TEST_STATUS.md`](docs/TEST_STATUS.md).

## Independence and attribution

Stream Wallet is an independent community project and is not represented as an official ZKAS release. It is designed for compatibility with the open-source ZKAS wallet technology maintained by FireCash contributors.

See [`NOTICE.md`](NOTICE.md) and [`LICENSE`](LICENSE).
