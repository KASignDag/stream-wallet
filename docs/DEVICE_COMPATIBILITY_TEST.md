# Device compatibility test

Use disposable wallets with no funds. Never paste a recovery phrase into an issue, chat, screenshot or test report.

## Official wallet to Stream Wallet

1. On a test device, create a new 12-word wallet in the official ZKAS wallet.
2. Record its mainnet account 0 address offline.
3. In Stream Wallet, choose **Restore wallet** and enter the 12 words.
4. Confirm the three requested words and approve device authentication.
5. Unlock Stream Wallet and compare its complete account 0 address with the official wallet address.
6. Mark the direction as passed only if every character matches.

## Stream Wallet to official wallet

1. Permanently remove the disposable Stream Wallet vault and authenticate the removal.
2. In Stream Wallet, choose **Create new wallet** and write down the displayed 12 words offline.
3. Complete the three-word check and approve encrypted storage.
4. Record Stream Wallet's complete mainnet account 0 address offline.
5. Restore the 12 words in the official ZKAS wallet and compare its account 0 address.
6. Mark the direction as passed only if every character matches.

## Vault checks

Run these checks on both iPhone and Android:

- Cancel setup authentication: no wallet should be saved.
- Background the app: it should return locked and hide sensitive content in the app switcher.
- Unlock with the enrolled biometric or device credential.
- Enter an incorrect confirmation word: saving must remain blocked.
- Type `DELETE`, cancel authentication and verify the wallet remains.
- Repeat removal, approve authentication and verify the wallet is gone.
- Restart the app after removal and verify it offers fresh setup.

Record only platform, OS version, app commit, pass/fail and the public addresses. Do not record recovery words.
