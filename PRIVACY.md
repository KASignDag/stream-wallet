# Stream Wallet privacy notice

Last updated: September 9, 2026

Stream Wallet is a non-custodial ZKAS wallet. The recovery phrase and spending authority are encrypted on the user's device and are not sent to the hosted wallet service.

## Data processed on the device

- The 12-word recovery phrase and derived spending material.
- The wallet address, settings and authentication state.
- Transaction details needed to review and sign a payment.

The encrypted wallet vault can be permanently removed from the Security screen. Funds are not deleted from the blockchain; recovery afterward requires the user's 12-word phrase.

## Data sent to the hosted service

The app connects to `https://wallet.zkas.info/daemon`. It sends a full viewing key and a randomly generated wallet token so the service can scan ZKAS mainnet, report balances and history, and prepare unsigned payments. A full viewing key allows the service operator to observe this wallet's balance and transaction activity. It does not provide spending authority.

Normal internet metadata, including an IP address and request timing, is necessarily visible to the service and its hosting providers. Operators should document any server-side logging and retention before public distribution.

## Analytics and advertising

The app source contains no analytics SDK, advertising SDK or third-party tracking script. A publisher must update this notice and the store privacy disclosures before adding any such service.

## Support and responsible publishing

The distributing organization must add its legal name, contact method, service retention policy and privacy-policy URL before submitting the app to a store. This source notice is a technical baseline and is not a substitute for the publisher's legal review.
