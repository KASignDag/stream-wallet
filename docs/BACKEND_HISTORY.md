# Hosted history integration

The public ZKAS backend source is:

- Repository: https://github.com/firecash/zkas-rusty
- Wallet daemon: `zkas-walletd/`
- Operator guide: `docs/WALLETD.md`

The daemon documents `GET /api/wallet/history` as opt-in. Its default wallet
setting is `recoverable_history: false`. Enabling it requires:

```http
POST /api/wallet/settings
X-Wallet-Token: <wallet token>
Content-Type: application/json

{"recoverable_history":true}
```

This setting has a privacy tradeoff: the daemon documentation states that a
holder of the wallet file/token or full viewing key can read the recoverable
record, including outgoing recipients. Stream Wallet therefore does not enable
it silently. Version 0.3.7 stores successful outgoing broadcasts on the device
and labels the Activity limitation explicitly.

Before enabling hosted recoverable history in a later release:

1. Add a clear, affirmative user consent screen describing the viewing-key and
   token disclosure.
2. Confirm the production daemon's exact history response schema and normalize
   it at the network boundary.
3. Test whether enabling the flag records only future transactions or whether a
   rescan reconstructs earlier records.
4. Keep local/server deduplication by transaction ID.
5. Never transmit the seed or spending key.
