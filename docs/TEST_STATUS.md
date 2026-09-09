# Version 0.3.11 test status

This record contains no recovery phrase, secret key or complete wallet address.

## Verified on the earlier iPhone pilot

- The app installed and ran on a physical iPhone.
- A wallet created by Stream Wallet restored in the official ZKAS wallet with the same account 0 address.
- Device-authenticated lock and unlock worked.
- A 1 ZKAS mainnet receive appeared in the official wallet and later synchronized into Stream Wallet.
- The synchronized wallet showed 1 total and 1 maturing while the spendable balance remained 0, as expected during maturity.
- Automatic status polling updated the balance without a manual refresh button.
- The hosted service returned no itemized rows for the received coin even though it reported the correct balance.
- QR scan preserved the unlocked 1 ZKAS balance and filled the intended recipient.
- A physical-iPhone payment of 0.25 ZKAS plus a 0.03 ZKAS fee was reviewed, device-authenticated and broadcast successfully.
- The expected 0.72 ZKAS change was subsequently detected as maturing.

## Verified in the version 0.3 source review

- Automated web tests pass.
- The production bundle builds and the pinned signer hash check passes.
- The npm dependency audit reports zero known vulnerabilities.
- iPhone safe-area insets are applied to the header, banner, content, sheets and bottom navigation.
- Tab changes reset the shared content area to the top.
- A nonzero balance with empty itemized history is identified as detected funds rather than incorrectly claiming there has been no activity.
- QR scanning accepts only a complete ZKAS mainnet address and only prefills the unsigned payment form.
- Mobile payment and recovery inputs use a 16px minimum font and a bounded initial viewport to prevent persistent iOS form zoom.
- iOS locking follows the true background event rather than temporary inactive states such as presenting the in-app camera.
- Amount entry accepts either `0.05` or `.05` and converts both to exact integer sompi.
- Maturing-only funds are labeled as unavailable and cannot open the Send flow.
- Successful outgoing payments are saved locally with exact amount, fee, recipient, time and transaction ID.
- The encrypted native vault exposes the recovery phrase only through a dedicated device-authenticated action; the app clears the displayed phrase when its sheet closes or the wallet locks.
- Receive displays the complete account 0 address and provides an explicit full-address copy action.
- Receive renders a high-contrast QR code containing only the complete account 0 ZKAS address.
- The unavailable payment-request placeholder is hidden during the mainnet pilot; Home presents only Receive and Send.
- Send allows the recipient address to be typed or filled with a validated ZKAS mainnet QR scan.
- Activity clearly states that only outgoing transactions sent after this update appear until the hosted service provides itemized history.
- Local and hosted records are deduplicated by transaction ID, and local records are deleted with the wallet.
- Capacitor 8 migration settings are present for iOS and Android.
- The iOS app-switcher privacy cover is attached to the active scene window.
- Personal Apple development-team settings and signing assets are absent from the handoff source.

## Must be completed on version 0.3 before external beta use

- Build and run on a physical iPhone with Xcode 26 or newer.
- Confirm the header no longer overlaps the clock, Dynamic Island or status indicators.
- Background the app and confirm its app-switcher preview is fully obscured.
- Confirm Face ID lock and unlock after backgrounding.
- Confirm Face ID is required to reveal the recovery phrase, verify all 12 words match the paper backup, then close the sheet and confirm they disappear.
- Scan a known ZKAS address QR code, deny/cancel camera access once, and verify no scan can prepare or send a payment automatically.
- While the scanner is open, background the entire app and confirm the wallet requires authentication when reopened.
- Open and close Send and Scan repeatedly and confirm the WebView always returns to its normal scale.
- Wait until the received test coin is spendable, then complete a small send-back and verify recipient, amount, fee and both histories.
- Authenticate wallet removal, reinstall or relaunch, restore from the paper phrase and confirm the identical full account 0 address and balance.
- Run the hostile prepared-bundle test against the release signer.
- Complete independent security review before describing the wallet as ready for unrestricted mainnet use.

Android remains unverified on a physical device.
