# Roadmap

## Required before a public beta

1. Complete the remaining items in `docs/RELEASE_GATES.md`.
2. Exercise create, restore, reveal, lock, send, scan and permanent removal on
   supported physical iOS and Android devices.
3. Add hostile prepared-bundle tests against the release signer.
4. Obtain independent review of the native vault, signer boundary and hosted
   walletd integration.
5. Assign the publishing organization, support contact, privacy-policy URL,
   backend operator and incident-response owner.

## Backend and history

- Define and test an itemized history response from `zkas-walletd` before
  offering users the privacy-sensitive recoverable-history setting.
- Reconcile local outgoing records with hosted records by transaction ID.
- Add explicit rescan progress and recovery diagnostics.
- Support a user-selected self-hosted daemon.

## Product follow-up

- Complete accessibility and localization review.
- Add deterministic release notes and signed artifact hashes.
- Add opt-in crash reporting only if it can be proven not to capture wallet
  secrets or private transaction data.
- Consider payment-request QR amounts only after a URI format is standardized
  and independently reviewed.

## Distribution

- Publish iOS through an eligible Apple Developer organization.
- Configure Android application signing and Play Console ownership under the
  publishing legal entity.
- Begin with a small invitation-only beta and low-value disposable wallets.
