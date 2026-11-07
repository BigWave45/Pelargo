# Pelargo

**One checkout. Cross-chain payments. Independently verified settlement.**

Pelargo is a merchant-first, non-custodial crypto checkout and settlement-verification layer. Merchants create orders and hosted checkout sessions; buyers pay through a supported provider route; Pelargo independently verifies destination settlement before marking an order paid.

## Demo and source

- **Integrated Preview:** https://reliability-background-recon.pelargo.pages.dev
- **Repository:** https://github.com/BigWave45/Pelargo
- **Testing and acceptance record:** [docs/TESTING.md](docs/TESTING.md)
- **Merchant integration guide:** [docs/INTEGRATION.md](docs/INTEGRATION.md)

The Preview is a testnet demonstration. Do not use it to collect customer funds.

## The problem Pelargo addresses

A submitted wallet transaction or a provider's success response is not proof that a merchant received the expected asset. Pelargo maintains the merchant/order lifecycle and independently checks destination-chain settlement before declaring an order paid.

## How it works

1. A merchant creates an order and requests a short-lived, signed buyer checkout session.
2. The buyer opens hosted checkout and connects a supported wallet.
3. Pelargo obtains a quote and deposit instructions from its configured provider.
4. The buyer submits the source-chain payment.
5. Pelargo verifies the expected destination-chain transfer and persists matching settlement evidence.
6. The order is marked paid only after destination verification succeeds.

The provider supplies route discovery, quotes, deposit instructions and provider-side transfer status. Pelargo owns merchant/order binding, checkout sessions, payment lifecycle and destination settlement verification. Provider SUCCESS alone is insufficient to mark an order paid.

## Demonstrated route and limitations

The current Preview demonstration uses a provider-supported **Base Sepolia ERC-20 source asset to NEAR testnet NEP-141 destination asset** route through the Tidepool / NEAR Intents-compatible testnet environment. The demonstrated destination is 1 USDC to `agentg.testnet`.

This is a specific testnet route, not universal cross-chain coverage. Route and asset availability depend on the provider's catalogue and liquidity. Pelargo does not currently provide arbitrary-chain settlement verification, automatic provider failover or route comparison. Mainnet committed quotes remain disabled.

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

## Merchant integration

The current integration pattern is server-side merchant authentication and checkout-session creation, followed by a redirect or embed using a short-lived buyer session token. Merchant API keys must remain on the merchant server.

The repository includes a custom-element embed and integration documentation. It does not currently provide a stable published SDK/CDN package, Shopify or WooCommerce plugin, or merchant webhook delivery. See [docs/INTEGRATION.md](docs/INTEGRATION.md) and [docs/EXTERNAL_MERCHANT_TEST.md](docs/EXTERNAL_MERCHANT_TEST.md).

## Architecture

- Frontend: React, TypeScript and Vite.
- Application/API: Cloudflare Pages Functions.
- Persistence: Cloudflare D1.
- Provider integration: Tidepool / NEAR Intents-compatible testnet environment.
- Destination verification: NEAR NEP-141 chain verification.
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

- Integrated non-production branch: `reliability/background-reconciliation`.
- Release candidate branch: `release/hackathon-candidate`.
- Existing Cloudflare Pages production branch: `build/live-intents`.
- `main` is the repository default branch and is being used as the release-candidate base.
- Cloudflare Pages project: `pelargo`.

The release candidate is being assembled from reviewed application changes. It is not yet merged into `main` or promoted to production. Do not infer that a GitHub merge changes the Cloudflare production branch.

## Safety

- All demonstrated payment activity is testnet activity.
- Keep `ALLOW_MAINNET_DEPOSITS` unset.
- Do not use the Preview prototype to collect real customer funds.
- Never expose merchant API keys, provisioning secrets, session-signing secrets or indexer credentials in browser code or public repositories.
- A quote, deposit address, provider status or wallet transaction hash is not settlement proof.
- Production branch changes, domain routing, mainnet activation and production database changes require explicit approval.

## License

MIT
