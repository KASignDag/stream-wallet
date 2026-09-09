# Mainnet release gates

Mainnet code may be exercised only as a controlled 1–2 ZKAS pilot until every applicable public-release gate is satisfied.

## 1. Compatibility

- [x] Pin and hash-check the official signer used by Stream Wallet.
- [x] Verify a public 12-word vector derives the expected official mainnet account 0 address in automated tests.
- [ ] Generate a disposable wallet in the official ZKAS wallet, restore it in Stream Wallet and record both account 0 addresses.
- [x] Generate a disposable wallet in Stream Wallet, restore it in the official ZKAS wallet and verify the account 0 address on the iPhone pilot.
- [ ] Verify the two addresses match in each direction on both an iPhone and an Android test device.
- [x] Document birthday/rescan behavior so recovery does not appear to lose funds.

## 2. Key protection

- [x] Integrate only the official `zkas-signer` build and verify its pinned hash.
- [x] Encrypt the device seed before persistence.
- [x] Use iOS Keychain and Android Keystore-backed secrets for the wrapping key.
- [x] Lock whenever the app leaves the foreground and require local authentication to unlock.
- [x] Require local authentication before permanent wallet removal.
- [x] Prevent Android screenshots and obscure the iOS app-switcher snapshot.
- [ ] Compile, install and exercise save/unlock/removal on supported iOS and Android devices.
- Confirm logs, crash reports and analytics cannot contain seed material.

## 3. Transaction safety

- [x] Preserve the official recipient, amount, change and maximum-fee checks.
- [x] Display the final recipient, amount and fee immediately before signing.
- [ ] Test hostile prepared bundles against the real WASM verifier and prove altered outputs are refused.
- [x] Disable partial/split delivery; one reviewed payment is either fully prepared or not signed.

## 4. Network and privacy

- [x] Use a viewing-key-only hosted wallet daemon.
- [x] Clearly disclose that the selected daemon can view wallet history and balances.
- [ ] Support a user-selected self-hosted daemon.
- [x] Pin the production service domain in code and Content Security Policy.

## 5. Review and distribution

- [x] Run dependency and repository secret scans for version 0.3. Repeat them for every release candidate.
- Run platform static-code analysis on the signed release candidate.
- Obtain independent security review before public mainnet release.
- Produce reproducible release artifacts where the platform permits.
- Protect and back up mobile signing keys outside the repository.
- Publish official hashes and verified store links on `wallet.zkas.stream`.
