# Contributing to Stream Wallet

Stream Wallet welcomes review and contributions. It signs real ZKAS mainnet
transactions, so changes must preserve the security boundaries documented in
`SECURITY.md` and `docs/ARCHITECTURE.md`.

## Start here

1. Read `README.md`, `SECURITY.md`, `docs/ARCHITECTURE.md` and
   `docs/RELEASE_GATES.md`.
2. Fork the repository and create a focused branch.
3. Install exact dependencies with `npm ci`.
4. Run `npm audit --audit-level=low`, `npm test`, `npm run build` and
   `npm run mobile:sync` before opening a pull request.
5. Describe the devices and networks actually tested. Never describe an
   untested platform as verified.

## Security-sensitive changes

Changes to the native vault, signer, payment preparation, bundle verification,
backend protocol, QR parsing or lifecycle locking require focused automated
tests and physical-device regression testing. Do not replace the vendored
signer or update its pinned hash without reviewing the upstream source and
repeating compatibility and hostile-bundle tests.

## Secrets and user data

Never commit or paste:

- recovery phrases, seeds, spending keys or unredacted wallet exports;
- Apple or Android signing credentials;
- provisioning profiles, certificates, keystores or API tokens;
- private backend credentials or production logs containing wallet data.

Use disposable pilot wallets and redact complete addresses and transaction
metadata unless they are intentionally public test vectors.

## Pull requests

Keep each pull request narrow. Include the reason for the change, security
impact, tests run, device results and any remaining limitations. A passing CI
run is necessary but is not a substitute for wallet-security review.

## Responsible disclosure

Do not open a public issue for an exploitable vulnerability or leaked secret.
Use the private security-reporting method configured by the repository owner.
Until one is configured, contact the publishing organization privately.
