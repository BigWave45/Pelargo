# Pelargo

**One embeddable checkout. Cross-chain payments. Independently verified settlement.**

Pelargo is a merchant-first, non-custodial cross-chain payment checkout. Merchants integrate a checkout widget into their own storefront or use hosted checkout; customers pay with supported digital assets, including stablecoins such as USDC, across available networks. Pelargo manages the merchant order and checkout lifecycle, then independently verifies destination-chain settlement before marking an order paid.

The widget is the customer-facing payment experience. The settlement-verification layer is the infrastructure behind it. Pelargo is not limited to stablecoins, and it does not claim that every asset or network is currently supported.

## Demo and source

- **Current merged-main demo (Preview/testnet):** https://main.pelargo.pages.dev
- **Release-candidate deployment:** https://release-hackathon-candidate.pelargo.pages.dev
- **Integrated Preview (development/acceptance):** https://reliability-background-recon.pelargo.pages.dev
- **Repository:** https://github.com/BigWave45/Pelargo
- **Vision and development history:** [docs/VISION_AND_DEVELOPMENT_HISTORY.md](docs/VISION_AND_DEVELOPMENT_HISTORY.md) (product direction, parallel development branches and commit-history context)
- **Testing and acceptance record:** [docs/TESTING.md](docs/TESTING.md)
- **Merchant integration guide:** [docs/INTEGRATION.md](docs/INTEGRATION.md)

The main and candidate URLs are non-production Preview deployments using the isolated Preview environment and Preview D1 database. They are testnet demonstrations. Do not use them to collect customer funds. The built-in production hostname, https://pelargo.pages.dev, remains on the separately configured production branch.

## The problem Pelargo addresses

Merchants need a checkout experience they can place inside their existing storefront without having to build cross-chain payment orchestration and settlement checks themselves. A submitted wallet transaction, source-chain deposit, or provider success response is not proof that the merchant received the expected destination asset. Pelargo gives merchants an embeddable payment surface and owns the order lifecycle behind it, including independent destination-chain verification before an order is marked paid.

## How it works

1. A merchant creates an order and requests a short-lived, signed buyer checkout session.
2. The buyer uses the embedded Pelargo checkout widget or its hosted-checkout equivalent and connects a supported wallet.
3. Pelargo obtains a quote and deposit instructions from its configured provider.
4. The buyer submits the source-chain payment.
5. Pelargo verifies the expected destination-chain transfer and persists matching settlement evidence.
6. The order is marked paid only after destination verification succeeds.

The provider supplies route discovery, quotes, deposit instructions and provider-side transfer status. Pelargo owns merchant/order binding, checkout sessions, payment lifecycle and destination settlement verification. Provider SUCCESS alone is insufficient to mark an order paid.

## Demonstrated route and limitations

The current Preview demonstration uses a provider-supported **Base Sepolia ERC-20 source asset to NEAR testnet NEP-141 destination asset** route through the Tidepool / NEAR Intents-compatible testnet environment. The demonstrated destination is 1 USDC to `agentg.testnet`.

This is a specific testnet route, not universal cross-chain coverage. Route and asset availability depend on the provider's catalogue and liquidity. Pelargo does not currently provide arbitrary-chain settlement verification, automatic provider failover or route comparison. Mainnet committed quotes remain disabled.

## Why NEAR matters to Pelargo

NEAR is the destination settlement network in the demonstrated cross-chain payment flow, not a decorative wallet or an incidental integration. The current route brings a payment from Base Sepolia to a NEAR testnet NEP-141 asset. Pelargo then checks the destination transfer against the merchant order's expected token, recipient and amount using NEAR chain data before it treats settlement as complete.

This makes NEAR part of the product's core trust boundary: the merchant's paid decision depends on independently verifiable delivery to the NEAR destination, rather than relying only on the routing provider's status. The configured route uses a Tidepool / NEAR Intents-compatible testnet environment. We describe it that way deliberately; this repository does not claim to implement the NEAR Intents protocol itself or to provide general-purpose NEAR routing infrastructure.

The current scope is specific and testnet-only. The demonstrated route and evidence are documented above and in [docs/TESTING.md](docs/TESTING.md). Broader NEAR asset/network coverage should be claimed only when implemented and verified.

## Wallet connection

- External mobile browsers use the official `@metamask/connect-evm` client to initiate MetaMask app handoff and obtain an EIP-1193 provider.
- Inside MetaMask Mobile, the injected-provider path remains available.
- Reown AppKit remains available for other supported wallet sessions.
- The external iPhone browser to MetaMask handoff and a subsequent Preview checkout were manually tested by the user. The checkout completed and the merchant dashboard displayed Settled.

This is a manual acceptance result, not exhaustive compatibility testing across all mobile browsers, wallet versions or account/network-change scenarios.

## Verified Preview evidence

- **ORDER-35541967:** completed Base Sepolia to NEAR testnet payment. Preview records immutable source-deposit evidence and independently verified NEAR NEP-141 destination-settlement evidence. Exactly 1 USDC was delivered to `agentg.testnet`. This is the strongest complete dual-chain evidence recorded.
- **ORDER-68886375:** user-confirmed external iPhone browser to MetaMask handoff and successful Preview checkout. Preview records order `paid`, lifecycle `settled`, provider status `SUCCESS`, and independently verified destination evidence for 1 USDC to `agentg.testnet`. No matching source-deposit evidence row is recorded for this order, so it is not described as complete dual-chain evidence.
- **External merchant acceptance:** the hosted Preview workflow passed seven checks for merchant API authentication, buyer-session validation, merchant-scoped order retrieval, duplicate-order rejection, the pre-quote payment boundary and cross-merchant isolation. It creates a pending Preview order only; it does not initiate a payment.

These testnet results do not establish mainnet or production readiness. A single observed duration is not a latency benchmark or guarantee. No additional payment is needed merely to repeat the demonstrated route.

## Merchant integration and checkout widget

The checkout widget is Pelargo's primary customer-facing product surface. A merchant authenticates server-side, creates an order and short-lived checkout session, then places the Pelargo custom element in its storefront or sends the buyer to the hosted-checkout equivalent. The widget presents the payment experience; Pelargo's API and lifecycle services bind that session to the merchant's order and verify settlement. Merchant API keys must remain on the merchant server.

The repository includes a custom-element embed and integration documentation. This is an implemented integration pattern, not yet a stable published SDK/CDN package. Pelargo does not currently provide Shopify or WooCommerce plugins or merchant webhook delivery. Supported assets and networks are limited to implemented and provider-available routes; stablecoins such as USDC are supported where a route exists, but stablecoins are not the only intended asset class. See [docs/INTEGRATION.md](docs/INTEGRATION.md) and [docs/EXTERNAL_MERCHANT_TEST.md](docs/EXTERNAL_MERCHANT_TEST.md).

## Architecture

- Frontend: React, TypeScript and Vite.
- Application/API: Cloudflare Pages Functions.
- Persistence: Cloudflare D1.
- Provider integration: Tidepool / NEAR Intents-compatible testnet environment.
- NEAR integration: NEP-141 destination-asset settlement verification using NEAR chain data; the demonstrated cross-chain route uses a Tidepool / NEAR Intents-compatible testnet environment.
- Background processing: scheduled reconciliation Worker for payment lifecycle recovery and verification.

The implementation includes merchant-scoped API access, signed short-lived checkout sessions, lifecycle transition validation, audit events, provider quote binding, source-deposit verification for the configured Base Sepolia route, destination settlement verification and reconciliation-job concurrency controls.

## Testing

Local checks:

```bash
bun install
bun run lint
bun run test:security
bun run test:api
bun run test:external-merchant
bun run build
```

Automated tests, hosted merchant acceptance and manual payment evidence are documented separately in [docs/TESTING.md](docs/TESTING.md). Automated tests include mocked provider/RPC responses and an in-memory database; they do not prove production readiness.

## Branch and release status

- GitHub default branch: `main`.
- Merged release candidate: `release/hackathon-candidate`, merged through PR #7.
- Integrated non-production branch: `reliability/background-reconciliation`.
- Cloudflare Pages production branch: `build/live-intents` (unchanged).
- Cloudflare Pages main-branch Preview alias: `https://main.pelargo.pages.dev`.
- Cloudflare Pages project: `pelargo`.

PR #7 merged the reviewed release candidate into `main` at merge commit `d18ae93a3eda3263eadc420cb951f4ebe52b2764`. Cloudflare successfully built and deployed that exact merge commit as a Preview deployment using the isolated Preview configuration and Preview D1 database. A GitHub merge does not change the Cloudflare production branch or production database.

The main-branch Preview is the cleanest current demo URL. The built-in production hostname `pelargo.pages.dev` remains attached to `build/live-intents` until production configuration and data migration are separately reviewed and explicitly approved.

## Safety

- All demonstrated payment activity is testnet activity.
- Keep `ALLOW_MAINNET_DEPOSITS` unset.
- Do not use Preview to collect real customer funds.
- Never expose merchant API keys, provisioning secrets, session-signing secrets or indexer credentials in browser code or public repositories.
- A quote, deposit address, provider status or wallet transaction hash is not settlement proof.
- Production branch changes, domain routing, mainnet activation and production database changes require explicit approval.

## License

MIT
