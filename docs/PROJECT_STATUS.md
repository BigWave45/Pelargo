# Pelargo project status and handoff

**Last consolidated:** 7 November 2026  
**Repository:** [BigWave45/Pelargo](https://github.com/BigWave45/Pelargo)  
**Active branch:** design/blue-white-premium

This document is the current handoff. Historical investigation logs and superseded implementation notes have been removed. Use Git history when an older implementation detail is needed.

## Verified payment state

The Base Sepolia → NEAR testnet route has been demonstrated on Preview, including a subsequent live mobile checkout using Reown and MetaMask.

- ORDER-35541967 is paid/settled and has both immutable Base Sepolia source-deposit evidence and independently verified NEAR NEP-141 destination-settlement evidence.
- The destination transfer delivered exactly 1 USDC to agentg.testnet.
- ORDER-45723806 is also recorded as paid/settled with destination evidence, but it has no source-deposit evidence row. Do not describe it as fully evidenced on both chains.
- In the latest user-reported mobile acceptance test, the checkout page itself displayed Payment status: Settled, Provider: SUCCESS and Settlement check: verified after connecting MetaMask through Reown on Base Sepolia. The order ID and transaction hashes for this additional test have not yet been captured in this handoff.
- The user reported that the latest checkout completed quickly. No measured duration or latency guarantee has been established.
- Do not initiate another payment solely to repeat the demonstrated route.

This proves one supported testnet route. It does not establish mainnet readiness, production readiness, universal route coverage or a successful scheduled reconciliation run.

## Current implementation

**Merchant and order lifecycle**
- Merchant registration/login, authenticated dashboard sessions and merchant API-key issuance/rotation.
- Merchant-scoped destination settings, order creation, checkout sessions and payment activity.
- Short-lived signed buyer sessions bound to merchant, order, amount, destination asset and recipient.
- Provider asset discovery, dry quotes, explicit committed-quote confirmation and provider status polling.
- Independent NEAR NEP-141 destination verification; only matching verified settlement evidence can mark an order paid.
- Source-deposit verification and evidence recovery for the demonstrated Base Sepolia route.

**Wallet**
- Injected EIP-1193 wallet support for eligible Base Sepolia ERC-20 source assets.
- Exact provider-quoted deposit address and atomic amount are used for the wallet transfer.
- Manual deposit instructions remain the fallback.
- Reown AppKit is initialized in Preview using the user-provided Project ID, Ethers adapter and Base Sepolia-only network. Checkout wallet connection uses AppKit hooks and its EIP-1193 provider.
- Live mobile acceptance passed: the user connected MetaMask through Reown on Base Sepolia, completed checkout, and Pelargo itself displayed Settled, Provider SUCCESS and Settlement check verified. The order ID and transaction hashes were not captured in this handoff.
- Remaining wallet checks: account changes, disconnect/reconnect and network-switch edge cases. No measured checkout duration or latency guarantee has been established.

**Frontend**
- The active branch contains the redesigned merchant Overview, destination settings, checkout creation, hosted buyer checkout, Developers and account views.
- Design direction: blue-and-white, modern financial infrastructure with editorial restraint. Use real payment data and explicit lifecycle states; no mock payment progress or fabricated metrics.
- Review the complete experience on mobile and desktop, including loading, empty, error and terminal states.

**Developer integration**
- Server-side merchant session creation and the hosted checkout/embed path are documented in docs/INTEGRATION.md.
- Merchant credentials stay server-side. Buyer checkout uses a short-lived one-order bearer token.
- No stable published SDK/CDN package, Shopify/WooCommerce plugin or merchant webhook delivery is released.
- The external merchant-origin integration still needs independent acceptance testing.

## Reown / WalletConnect work

Reown AppKit is the planned WalletConnect integration to address mobile browsers where no injected EVM wallet is detected.

Implementation and primary mobile payment acceptance are complete:
1. Reown Project ID configured in AppKit.
2. AppKit, Ethers adapter and ethers dependencies installed with matching bun.lock.
3. Connector restricted to Base Sepolia.
4. Cloudflare Pages Preview build and deployment completed.
5. User connected MetaMask through Reown on mobile and completed checkout. Pelargo displayed Settled, Provider SUCCESS and Settlement check verified.

Remaining edge-case checks are account changes, disconnect/reconnect and network switching. Reown changes wallet connection only; it does not expand token, route or destination-verification support.

## Branch and domain strategy

- design/blue-white-premium is the active development branch.
- build/live-intents is the existing Cloudflare Pages production branch. Do not change it yet.
- main contains an older Google AI Studio-generated version and is not the current product source.
- Preview URL: https://design-blue-white-premium.pelargo.pages.dev.
- A free custom domain has not yet been selected or configured.

Do not merge, move the production branch, deploy Production or change domain routing now. First finish the redesign and Reown work, complete acceptance testing, and freeze a release candidate. Then reconcile the candidate against build/live-intents, update main to the approved release, and only after explicit approval change the Cloudflare production branch and attach the chosen domain. A GitHub merge to main alone does not change the Cloudflare Pages production branch.

## Remaining work

1. Complete Reown edge-case checks for account changes, disconnect/reconnect and network switching.
2. Review all redesigned screens on mobile and desktop; verify navigation, real actions, and loading/empty/error/success states.
3. Independently test the merchant-origin integration using a separate merchant backend and browser origin. Do not expose merchant credentials to the buyer.
4. Verify the latest Preview deployment corresponds to the intended branch head before using it for acceptance.
5. Consolidate submission/demo materials after acceptance.

## Release and safety constraints

- Preview/testnet only for current work. Keep ALLOW_MAINNET_DEPOSITS unset.
- Do not use the prototype to collect real customer funds.
- Do not modify Production D1 or other Production resources.
- No merge to the release/production path, Production deployment, domain-routing change, mainnet activation or payment initiation without explicit user approval.
- Do not create another payment just to repeat an already demonstrated route.
