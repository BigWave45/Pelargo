# Product direction and wallet-first checkout plan — 7 November 2026

This file records the current product/design decision and implementation state. The Base Sepolia wallet path is implemented in the draft branch, but a live end-to-end wallet payment remains unverified.

- Continue the UI, UX and copy redesign in parallel with wallet technical validation. The redesign is not paused or superseded by wallet work.
- Preserve the existing merchant account/API-key model, merchant-created checkout sessions, widget contract, Tidepool/1Click quote integration, order state machine, provider polling and independent NEAR settlement verifier.
- Universal checkout is the long-term product direction: one merchant integration, buyer pays from a wallet/network/asset they already use where supported, and the merchant receives its configured settlement asset. Do not claim universal wallet or chain support in the current build.
- Hackathon wallet implementation is Base Sepolia-first: injected EIP-1193 connection, account/network detection, supported ERC-20 balance lookup, exact provider quote amount and deposit-address transfer signed by the connected wallet.
- The current manual deposit-address flow remains available as a fallback. Wallet transaction submission does not mark an order paid; provider detection and independent NEAR settlement verification remain authoritative.
- Wallet connection, token balance discovery and transaction signing/broadcast are implemented as separate steps. Only injected EVM wallets on Base Sepolia are currently supported by this draft.
- Design direction remains blue/white, modern financial infrastructure plus editorial minimalism. Remove generic AI decoration. Use product UI states, precise diagrams and restrained geometric elements only where they explain the payment journey. Design copy around simplicity, with separate messaging for buyers, merchants and developers.
- Remaining order: Cloudflare Pages Preview browser acceptance, fresh Base Sepolia testnet payment, confirmation that provider polling detects the transfer, and independent NEAR settlement verification. Continue the broader public-site, merchant workspace and developer copy/UI redesign in parallel.
- No production deployment, merge, mainnet activation or payment initiation without explicit approval.

---

# Preview integration and migration audit — 7 November 2026

## Base wallet execution feasibility finding — 7 November 2026

- Repository inspection of `functions/api/quote.ts`, `src/components/PelargoCheckout.tsx`, and the Base Sepolia verifier confirms the current provider flow is 1Click quote → committed quote with `quote.depositAddress` and `quote.amountIn` → source-chain deposit → status polling. The frontend currently displays the deposit address and requires the buyer to send manually.
- The current quote integration does not request or expect provider-supplied EVM transaction calldata. This does **not** block wallet payment: for an ERC-20 source asset on Base Sepolia, the buyer's connected wallet can sign and broadcast the standard token `transfer(depositAddress, amountIn)` transaction. Pelargo must derive the token contract from the exact provider asset ID and use the exact quoted atomic amount; never accept a free-form token contract or amount from the browser.
- The existing verifier in `functions/_lib/base-deposit-verifier.ts` already validates Base Sepolia chain ID `0x14a34`, successful transaction receipt, exact ERC-20 contract, exact deposit recipient, exact atomic amount and at least 12 confirmations. This gives us a substantial existing foundation for a wallet-first Base Sepolia path.
- Provider lifecycle documentation describes the deposit-address model: the buyer sends the source token to the quote's unique deposit address; 1Click detects the deposit and progresses through status polling. The optional `deposit/submit` notification can accelerate detection but is not the wallet execution mechanism. Keep Pelargo's independent destination settlement verification as the final paid-state authority.
- Important API boundary: current `POST /api/deposit-submit` authenticates a merchant session or merchant API key, not the buyer's signed checkout session. Do not expose a merchant credential to the buyer widget. A wallet-first flow can initially rely on provider deposit detection and existing status polling; if explicit transaction notification is needed, add a buyer-session-authorized route that binds the transaction to the committed quote and independently verifies it before notifying the provider.
- Technical direction: Base Sepolia first, injected EIP-1193 wallet provider, request chain `0x14a34`, read connected account, check exact ERC-20 balance, build standard ERC-20 `transfer(address,uint256)` calldata to the committed deposit address for the committed `amountIn`, request wallet signature/broadcast, then track provider status and existing destination settlement verification. Handle wrong network, missing wallet, insufficient balance, rejected signature, duplicate click, expired quote and uncertain broadcast. Keep manual instructions as fallback.
- This finding narrowed the technical risk: a standard ERC-20 transfer is sufficient for the supported Base Sepolia quote deposit. The wallet implementation now exists in the draft branch; live payment and settlement acceptance remain outstanding.


- Read-only Cloudflare Pages deployment inspection confirms the latest active-branch Preview deployment is `bf42d182-f628-4073-b7b2-e4f8f7847475`, commit `3acdaa917dd796f3a9c652defbcd97361fb82e91`, with build and deploy stages successful. The stable Preview alias remains `https://reliability-background-recon.pelargo.pages.dev`. This is a deployment check, not an independent merchant-origin checkout acceptance test.
- GitHub Actions CI run #490 for commit `3acdaa9` completed successfully. The run includes the repository CI workflow; it does not exercise a live merchant API key or a real committed quote.
- Read-only query of Preview D1 `d1_migrations` confirms all 19 migrations are applied. In particular, `0019_reconciliation_backfill_eligible_states.sql` is recorded at migration id 18 and `0018_preview_password_reset.sql` at id 19. The filenames are not ordered by their application record IDs. No database writes were made. Production D1 was not queried or changed.
- Cloudflare deployment metadata confirms the Preview Pages deployment is bound to D1 database `0335acdc-f0e0-42f6-ba87-e3448fb91728`. The latest deployment metadata lists `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET` as secret-type bindings but does not expose their values; this does not independently prove their runtime validity.
- The Preview reconciliation Worker was previously verified as deployed with the five-minute cron active. The encrypted `RECONCILIATION_SECRET` value is not readable through the Cloudflare API, and no successful scheduled settlement run is established by this audit. Do not infer secret validity or attribute the existing settled order to the Worker.
- Merchant API-key issuance/rotation and the Developers integration screen are implemented on `reliability/background-reconciliation`. The standalone embed's `process.env.NODE_ENV` browser-runtime reference was fixed, and the latest Preview deployment includes that commit. The actual merchant flow remains unaccepted: issue/rotate a key, create a real merchant order/session server-side, load the widget from a separate merchant origin, preview a dry quote, and verify the buyer confirmation boundary. Do not commit a quote or send funds during this acceptance pass without explicit approval.
- A visual-only redesign is in progress on `design/blue-white-premium`, with draft PR #5 targeting `reliability/background-reconciliation`. It adds isolated checkout/workspace CSS and stylesheet imports; it does not intentionally change payment, quote, deposit, session, authentication, or settlement logic. The branch has not been deployed or merged. No CI run is currently reported for the PR head SHA `2cc147af80c8ab8ccd75f33c4cf2873032f801fc`; visual browser acceptance and build verification remain outstanding.
- No Production resources were queried or changed, no merge occurred, and no branch was deleted.

## Base Sepolia wallet implementation — 7 November 2026

- Implemented in `src/components/PelargoCheckout.tsx` on `design/blue-white-premium`: injected EIP-1193 wallet connect, Base Sepolia chain switch (84532 / `0x14a34`), connected account display, exact provider-token balance lookup, and standard ERC-20 transfer to the committed quote's deposit address using the exact atomic `amountIn`.
- The selected source token contract is parsed from the provider asset ID. The connected wallet must match the quote refund address. Source asset selection locks after committed deposit instructions exist. Quotes with a provider memo cannot use direct wallet transfer and stay on the manual path.
- Existing quote creation, commit behavior, provider status polling and independent destination settlement verifier were not replaced. The manual deposit-address path remains available. A wallet transaction hash is presented as submitted only, never as paid.
- Supported scope is injected EVM wallets on Base Sepolia for recognized Base Sepolia ERC-20 asset IDs. WalletConnect, mobile deep links, Solana/NEAR wallet signing, arbitrary chain support and universal asset discovery are not implemented.
- CI run `42325932624` on code commit `08dec058aba78c934a37e7ec44d0f783a007925d` passed type-check, checkout-session security tests, checkout API integration tests and frontend build.
- Live Preview browser acceptance and a fresh end-to-end testnet payment through independently verified NEAR settlement remain outstanding. This code change did not initiate a payment.
- Mobile provider detection was hardened in commit `afce17bb4ad9a85567380e25b6a6d93ca3342641`: the widget waits for MetaMask's asynchronous `ethereum#initialized` injection event, rechecks `window.ethereum`, and attaches account/network listeners after provider initialization. Cloudflare Pages Preview deployment `53a9a3b9-7f3c-4348-855d-a4356f0b20a5` built and deployed this exact commit successfully; the `design-blue-white-premium.pelargo.pages.dev` alias points to it. GitHub returned no PR workflow runs or combined status checks for this SHA, so CI is not verified for this patch. Retry MetaMask in-app browser connection before quote commitment or transfer.

## Next acceptance sequence

1. Sign in to the Preview merchant workspace and generate a merchant API key. Save it only in a server-side secret store; do not paste it into browser code or this chat.
2. From a merchant backend route, call `POST /api/checkout-session` with a fresh external order ID and trusted order configuration. Confirm the response is `201` and contains a short-lived session token and public session claims.
3. On a separate merchant-origin test page, load `https://reliability-background-recon.pelargo.pages.dev/pelargo.js`, call the merchant backend route, and mount `<pelargo-checkout>` using the returned claims and token.
4. Verify the widget mounts, requests token discovery, and displays a dry quote. Stop before buyer confirmation/committed quote unless a separate testnet payment has been explicitly approved.
5. Test authenticated `GET /api/order` or `GET /api/payment-status` from the merchant backend. Verify cross-merchant access is denied.
6. Separately establish Worker secret validity and scheduled invocation evidence from runtime logs and Preview D1 job state. Review expiry and uncertain-commit sweep side effects before dispatching or redeploying anything.


---

## Provider dependency and product-coverage disclosure — 7 November 2026

The current V1 is still dependent on the configured NEAR Intents / 1Click provider integration through Tidepool's testnet environment. Tidepool/1Click currently determines the source-token catalogue, available source/destination routes, quote availability and expiry, deposit address, exact source amount and provider-side deposit lifecycle. Pelargo does not currently provide its own independent routing/liquidity layer, second-provider redundancy, automatic provider failover or arbitrary-asset execution.

This is a provider dependency, not a claim that Pelargo is merely a thin UI wrapper. Pelargo owns merchant authentication and API-key boundaries, signed checkout sessions, order binding and lifecycle, checkout UX, provider-facing orchestration, and independent NEAR NEP-141 destination settlement verification. Nevertheless, source-asset and route coverage remain constrained by the configured provider and must be represented honestly in the product and demo.

Wallet support is separate from route support. The current direct wallet path supports injected EIP-1193 wallets on Base Sepolia for matching provider-listed ERC-20 source assets. Adding MetaMask, WalletConnect or other wallet connectors does not expand Tidepool's token catalogue, route liquidity or Pelargo's implemented destination verifiers. WalletConnect is not implemented yet.

Public copy and developer documentation must distinguish:
- **Implemented now:** provider-listed source assets/routes; Tidepool/1Click testnet quote and deposit flow; Base Sepolia injected-wallet transfer for eligible provider quotes; manual deposit fallback; independent NEAR NEP-141 destination settlement verification.
- **Not implemented:** arbitrary source assets/routes; provider redundancy/failover; independent Pelargo routing; WalletConnect; universal wallet discovery; EVM/Solana/Bitcoin/native-NEAR destination settlement verification.
- **Product direction:** a universal checkout interface that can add more wallet connectors, providers, source networks and settlement verifiers behind stable merchant and checkout contracts.

No production deployment, provider migration, additional provider integration or payment initiation is authorized by this documentation update.
