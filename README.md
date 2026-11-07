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

The latest settled Preview record found during the 7 November 2026 Reown acceptance follow-up is ORDER-49053014: 1 USDC delivered to agentg.testnet, provider SUCCESS, lifecycle settled, with independently verified NEAR destination transaction `3uZtiZpnhUd4r2wzbmUhPHwW6CAVBfsLLwWuUyfRrZPC` (block 276622029; 68 confirmations). Database events show 2 minutes 20.6 seconds from order creation to settlement, including 23.2 seconds from deposit detection to settlement. This is a strong temporal match to the user-reported Reown checkout, but the user has not explicitly confirmed the order ID. No source-deposit evidence row or source transaction hash is recorded for this order, so do not claim dual-chain evidence for it.

No additional payment is needed merely to repeat the already demonstrated route. These testnet results do not establish mainnet or production readiness.

## Wallet connection

The checkout initializes Reown AppKit with the Ethers adapter and a Base Sepolia-only network configuration. The buyer connects through AppKit, and the checkout reads the EIP-1193 provider, account and network state from AppKit. A live mobile checkout using Reown and MetaMask completed with the checkout page showing Payment status: Settled, Provider: SUCCESS and Settlement check: verified. Existing exact-amount ERC-20 transfer checks and independent settlement verification remain in place. Manual deposit instructions remain available.

The AppKit integration has passed a live mobile checkout acceptance test: the user connected MetaMask through Reown on Base Sepolia, completed checkout, and Pelargo displayed Payment status: Settled, Provider: SUCCESS and Settlement check: verified. The user reported that completion was fast; no measured duration or latency guarantee has been established. Account-change, disconnect/reconnect and network-switch edge cases remain separate acceptance tests. Reown adds wallet-connection options only; it does not expand route, asset or settlement-verification coverage.

## Merchant integration

The current integration pattern is server-side session creation followed by a redirect or embed using a short-lived buyer session token. Keep the merchant API key on the merchant server. The buyer token is a one-order bearer credential; the hosted checkout currently receives it in the URL fragment, removes it from browser history and sends it to the API in an Authorization header.

The repository contains a custom-element embed, but there is no stable published SDK/CDN package, Shopify/WooCommerce plugin or merchant webhook delivery. PR #6 adds a non-payment external merchant acceptance test. It has passed in GitHub Actions against the test Preview, covering merchant API authentication, signed buyer-session validation, merchant-scoped order retrieval, duplicate-order rejection, the pre-quote payment boundary and cross-merchant isolation (a second merchant receives 404 when attempting to retrieve the first merchant's order). The workflow uses repository Actions secrets; no merchant key is committed or pasted into chat. The test creates a pending Preview order only: it does not commit a quote or initiate a payment or transfer. See [docs/INTEGRATION.md](docs/INTEGRATION.md) and [docs/EXTERNAL_MERCHANT_TEST.md](docs/EXTERNAL_MERCHANT_TEST.md).

## Frontend direction

The active redesign uses a blue-and-white foundation with modern financial-infrastructure styling and editorial restraint. The workspace includes Overview, destination settings, checkout creation, buyer checkout, Developers and account views. Keep the interface grounded in live product data; do not add fabricated metrics or simulated payment progress.

## Branches, Preview and release controls

- Repository: [BigWave45/Pelargo](https://github.com/BigWave45/Pelargo)
- Integrated non-production branch: reliability/background-reconciliation
- External merchant acceptance test: merged via PR #6 into reliability/background-reconciliation
- Existing Cloudflare Pages production branch: build/live-intents
- main contains an older Google AI Studio-generated version and is not the current product source.
- Cloudflare Pages project: pelargo
- External merchant test Preview URL: [test-external-merchant-integ.pelargo.pages.dev](https://test-external-merchant-integ.pelargo.pages.dev)

Do not merge, change the Cloudflare production branch, deploy Production, change domain routing, modify Production D1, enable mainnet or initiate payments without explicit approval. Merging to GitHub main alone does not change the Cloudflare Pages production branch.

PR #6 is merged into reliability/background-reconciliation. The release sequence is: finish the design and wallet work; run acceptance tests; freeze a release candidate; reconcile it against the existing production baseline; update main to the approved release; then, with explicit approval, configure the production branch and domain. A free custom domain has not yet been selected or configured. Keep the Preview URL separate from the eventual public domain.

## Development

Stack: React, TypeScript, Vite, Cloudflare Pages Functions, Cloudflare D1 and NEAR Intents / 1Click.

```bash
bun install
bun run dev
bun run test:security
bun run test:api
bun run test:external-merchant
bun run build
```

The external merchant test requires `PELARGO_API_URL` and `PELARGO_MERCHANT_API_KEY`. For the hosted acceptance run, store the primary test merchant key as `PELARGO_TEST_MERCHANT_API_KEY` and a different merchant's key as `PELARGO_OTHER_TEST_MERCHANT_API_KEY` in GitHub Actions repository secrets. Run **External merchant acceptance** from the default branch; the workflow explicitly checks out `test/external-merchant-integration` and targets the test Preview URL. The 7 November 2026 run passed all checks, including cross-merchant isolation. Full instructions: [docs/EXTERNAL_MERCHANT_TEST.md](docs/EXTERNAL_MERCHANT_TEST.md).

## Safety

- Keep ALLOW_MAINNET_DEPOSITS unset.
- Use testnet assets only for the hackathon demonstration.
- Never expose merchant API keys, provisioning secrets, session-signing secrets or indexer credentials in browser code or public repositories.
- Do not use the Preview prototype to collect real customer funds.
- Do not treat a quote, deposit address, provider status or wallet transaction hash as settlement proof.
- Production and mainnet changes require explicit approval.

## License

MIT
