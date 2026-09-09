# Security policy

Stream Wallet is a live-mainnet pilot, not a public release. Its transaction path is enabled for controlled validation with a newly generated wallet holding no more than 1–2 ZKAS.

## Never include in a report

Do not send a recovery seed, private key or unredacted wallet backup to a developer, support account, website, chat, issue tracker or test report. Pilot recovery phrases must remain offline with the person controlling the test device.

## Invariants

- Recovery seeds and spend-authorizing keys remain on the user's device.
- A hosted service receives no spending authority.
- The signing device verifies recipient, amount, change and maximum fee.
- Stream Wallet uses the official ZKAS format and cryptographic implementation.

Security-sensitive changes require focused tests and review before merge.

The hosted daemon receives the full viewing key and can observe the wallet's balance and activity. It receives neither the recovery phrase nor spend authority. A compromised daemon can refuse service or return false display data; the on-device signer must still refuse any prepared bundle whose recipient, amount, change or fee differs from the reviewed payment.
