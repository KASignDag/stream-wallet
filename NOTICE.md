# Notices

Stream Wallet is an independent community client for the ZKAS network. It is not an official ZKAS wallet release.

The planned integration uses open-source components from:

- `firecash/zkas-wallet`
- `firecash/zkas-signer`
- `firecash/zkas-sdk`
- `firecash/zkas-rusty`

Those projects include work derived from Kaspa and Zcash ecosystem technologies. Their respective copyright and license notices must remain with any copied or distributed source and binary components.

The files under `src/signer/` and the signer verification scripts were vendored from `firecash/zkas-wallet` version 1.0.31 at upstream commit `bb5390e`. The walletd protocol types and byte-priced relay-fee rules in `src/network/mainnet.ts` track that same upstream implementation. They remain covered by the ISC license and upstream notices included in this repository.
