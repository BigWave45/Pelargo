# Pelargo

## Product

Pelargo is an embeddable, non-custodial crypto checkout layer. Merchants create an order and a short-lived checkout session; buyers pay through a provider-supported route; merchants receive their configured settlement asset after Pelargo independently verifies destination settlement.

The long-term direction is one merchant integration with broader wallet, network, asset and provider coverage. That is a product direction, not a claim about current compatibility.

## Current supported scope

- Preview uses Tidepool's NEAR Intents-compatible testnet environment.
- The demonstrated route is a provider-listed Base Sepolia ERC-20 source asset to a NEAR testnet NEP-141 destination.
- Pelargo supports an injected EIP-1193 wallet transfer for eligible Base Sepolia quotes, using the exact committed quote deposit address and atomic source amount. Manual deposit instructions remain available.
- Pelargo independently verifies NEAR NEP-141 destination settlement before marking an order paid.
- Official NEAR 1Click is an allowlisted mainnet provider option in the codebase. Mainnet committed quotes remain disabled; do not activate them for the hackathon.

Provider route availability is dynamic. Wallet connection does not create liquidity, expand the provider's token catalogue or add destination verifiers. Pelargo does not currently provide automatic provider failover, route comparison or arbitrary-chain settlement verification.

## What Pelargo owns

Pelargo owns merchant accounts and API-key boundaries, signed checkout sessions, merchant/order binding, checkout UI, provider orchestration, payment lifecycle and independent NEAR NEP-141 destination verification. The configured provider supplies source-asset discovery, quotes, deposit instructions and provider-side deposit detection.

A provider SUCCESS, a source-chain transfer or a submitted wallet transaction hash is not sufficient to mark an order paid. Settlement requires canonical destination-chain verification and matching persisted evidence.

## Verified Preview test

ORDER-35541967 completed the Base Sepolia → NEAR testnet route. Preview records both immutable source-deposit evidence and independently verified destination-settlement evidence. The merchant received exactly 1 USDC on agentg.testnet.

ORDER-45723806 is also recorded as paid/settled with destination evidence, but has no corresponding source-deposit evidence row. Do not describe that order as having complete dual-chain evidence.

No additional payment is needed merely to repeat the already demonstrated route. These testnet results do not establish mainnet or production readiness.

## Wallet connection

The current direct wallet path supports injected EIP-1193 wallets on Base Sepolia for eligible provider-listed ERC-20 assets. MetaMask asynchronous provider detection is handled, but mobile browser acceptance remains part of the test plan.

**Reown AppKit / WalletConnect is not enabled yet.** Integration is pending the Reown Project ID, matching package and bun.lock updates, a successful Preview build, and mobile connection/transfer tests. Reown adds wallet-connection options; it does not expand route or settlement coverage. Preserve injected-wallet and manual-deposit fallbacks.

## Merchant integration

The current integration pattern is server-side session creation followed by a redirect or embed using a short-lived buyer session token. Keep the merchant API key on the merchant server. The buyer token is a one-order bearer credential; the hosted checkout currently receives it in the URL fragment, removes it from browser history and sends it to the API in an Authorization header.

The repository contains a custom-element embed, but there is no stable published SDK/CDN package, Shopify/WooCommerce plugin or merchant webhook delivery. External merchant-origin integration still requires independent acceptance testing. See [docs/INTEGRATION.md](docs/INTEGRATION.md).

## Frontend direction

The active redesign uses a blue-and-white foundation with modern financial-infrastructure styling and editorial restraint. The workspace includes Overview, destination settings, checkout creation, buyer checkout, Developers and account views. Keep the interface grounded in live product data; do not add fabricated metrics or simulated payment progress.

## Branches, Preview and release controls

- Repository: [BigWave45/Pelargo](https://github.com/BigWave45/Pelargo)
- Active design/development branch: design/blue-white-premium
- Existing Cloudflare Pages production branch: build/live-intents
- main contains an older Google AI Studio-generated version and is not the current product source.
- Cloudflare Pages project: pelargo
- Preview URL: [design-blue-white-premium.pelargo.pages.dev](https://design-blue-white-premium.pelargo.pages.dev)

Do not merge, change the Cloudflare production branch, deploy Production, change domain routing, modify Production D1, enable mainnet or initiate payments without explicit approval. Merging to GitHub main alone does not change the Cloudflare Pages production branch.

The release sequence is: finish the design and wallet work; run acceptance tests; freeze a release candidate; reconcile it against the existing production baseline; update main to the approved release; then, with explicit approval, configure the production branch and domain. A free custom domain has not yet been selected or configured. Keep the Preview URL separate from the eventual public domain.

## Development

Stack: React, TypeScript, Vite, Cloudflare Pages Functions, Cloudflare D1 and NEAR Intents / 1Click.

```bash
bun install
bun run dev
bun run test:security
bun run test:api
bun run build
```

## Safety

- Keep ALLOW_MAINNET_DEPOSITS unset.
- Use testnet assets only for the hackathon demonstration.
- Never expose merchant API keys, provisioning secrets, session-signing secrets or indexer credentials in browser code or public repositories.
- Do not use the Preview prototype to collect real customer funds.
- Do not treat a quote, deposit address, provider status or wallet transaction hash as settlement proof.
- Production and mainnet changes require explicit approval.

## License

MIT
