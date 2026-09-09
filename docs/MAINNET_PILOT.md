# Controlled 1–2 ZKAS mainnet pilot

This is a real-funds validation, not a public launch. Stop immediately if any address, amount, balance or fee differs from the official ZKAS wallet.

## Before funding

1. Build and install Stream Wallet on one supported phone.
2. Create a brand-new wallet in Stream Wallet. Do not import a phrase already protecting meaningful funds.
3. Write the 12 words on paper and complete Stream Wallet's three-word confirmation.
4. Compare the full account 0 address with the same phrase restored in the official ZKAS wallet. Never send the phrase to another person or paste it into a website.
5. Remove the wallet from one test device, restore it from the paper backup, and confirm the identical address again.

An installed pre-mainnet Stream Wallet vault uses the old encrypted schema. Back up its phrase, authenticate removal, and restore it into this build. The app refuses to silently migrate a spending secret through the web layer.

## Receive test

1. Unlock Stream Wallet and wait for **Ready on ZKAS mainnet**.
2. Open Receive and compare the full address again.
3. Send only 1–2 ZKAS from a separate wallet.
4. Wait for the balance to move from maturing to spendable. A received payment is not immediately spendable.
5. Confirm Activity shows the arrival. If the app reports `missing_history`, do not send from the wallet.

## Send-back test

1. Send less than the spendable balance so the wallet can also pay the network fee.
2. On the final review screen, compare the complete recipient, amount, network fee and total leaving the wallet.
3. Authenticate only if every value is correct.
4. Confirm the destination wallet receives the payment and the transaction appears in both histories.

Do not retry automatically after an ambiguous broadcast error. First check the destination and transaction history so the same payment is not sent twice.

## Recovery behavior

New wallets remember the current DAA score as their birthday, which avoids scanning blocks from before creation. Restored phrases currently use birthday 0 for completeness. That scan can take much longer and can require an archival node. If the hosted service reports missing history, the displayed balance may be incomplete and spending stays disabled.
