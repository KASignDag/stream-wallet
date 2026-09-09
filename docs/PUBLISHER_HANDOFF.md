# Publisher handoff

Stream Wallet is an independent, non-custodial community wallet and is not represented as an official ZKAS release. This repository is source code for a controlled pilot, not an assurance that unrestricted mainnet use is safe.

## Toolchain

- Node.js 22 or newer
- Xcode 26 or newer and CocoaPods for iOS
- JDK 21, Android Studio, Android API 36 and Gradle 8.14.3 for Android

## Reproduce the web bundle

```bash
npm ci
npm audit --audit-level=low
npm test
npm run build
npm run mobile:sync
```

The signer integrity check runs automatically during the build. Do not replace or rebuild the signer without reviewing the source, updating the pinned hash and repeating all compatibility and transaction-safety tests.

## iOS publisher setup

1. Enroll the publishing legal entity in the Apple Developer Program as an organization and complete Apple's identity requirements.
2. Obtain permission to publish the Stream Wallet/ZKAS branding and operate or use the configured hosted daemon.
3. Change the bundle identifier if `stream.zkas.wallet` is not controlled by the publisher.
4. Open `ios/App/App.xcworkspace`, select the App target, enable automatic signing and select the publisher's organization team.
5. Set the final display name, version/build number, support URL, privacy-policy URL, screenshots and App Store privacy responses.
6. Archive a Release build, validate it in Xcode and distribute first through an internal TestFlight group.

Do not commit certificates, provisioning profiles, API keys, `.p12` files or account credentials. Store signing keys and recovery material in access-controlled systems owned by the publishing organization.

## Required pre-release review

- Complete every applicable item in `docs/RELEASE_GATES.md` and record device results in `docs/TEST_STATUS.md`.
- Have an independent wallet/security engineer review the key vault, signer boundary, prepared-bundle verification, network service and removal/recovery behavior.
- Confirm the hosted daemon's operator, security controls, availability, privacy logging and retention policy.
- Replace the baseline `PRIVACY.md` publisher placeholders with the legal entity's identity and contact information.
- Re-run dependency, secret, static-analysis and signed-device tests on the exact release commit.
- Publish the release commit and artifact hashes, and link only to verified store listings.

## Ownership transfer

Repository access alone does not transfer an Apple app. The accepting publisher must control the Apple organization, bundle identifier, certificates, App Store Connect record, privacy/support URLs and production service relationships. Record those owners privately before release; never put passwords or recovery phrases in GitHub issues.
