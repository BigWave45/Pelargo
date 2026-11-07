# Pelargo project status and handoff

**Last consolidated:** 7 November 2026  
**Repository:** [BigWave45/Pelargo](https://github.com/BigWave45/Pelargo)  
**Integrated non-production branch:** reliability/background-reconciliation  
**External merchant acceptance:** PR #6 merged into reliability/background-reconciliation

This document is the current handoff. Historical investigation logs and superseded implementation notes have been removed. Use Git history when an older implementation detail is needed.

## Verified payment state

The Base Sepolia → NEAR testnet route has been demonstrated on Preview, including a subsequent live mobile checkout using Reown and MetaMask.

- ORDER-35541967 is paid/settled and has both immutable Base Sepolia source-deposit evidence and independently verified NEAR NEP-141 destination-settlement evidence.
- The destination transfer delivered exactly 1 USDC to agentg.testnet.
- ORDER-45723806 is also recorded as paid/settled with destination evidence, but it has no source-deposit evidence row. Do not describe it as fully evidenced on both chains.
- In the latest user-reported mobile acceptance test, the checkout page itself displayed Payment status: Settled, Provider: SUCCESS and Settlement check: verified after connecting MetaMask through Reown on Base Sepolia. The latest settled Preview record is ORDER-49053014, a strong temporal match but not yet explicitly confirmed by the user. Its independently verified NEAR destination transaction is `3uZtiZpnhUd4r2wzbmUhPHwW6CAVBfsLLwWuUyfRrZPC` (block 276622029; 68 confirmations), for 1 USDC to agentg.testnet. No source-deposit evidence row or source transaction hash is recorded for this order; therefore its source transaction reference remains unconfirmed.
- Database lifecycle events for ORDER-49053014 show 2 minutes 20.6 seconds from order creation to settlement and 23.2 seconds from deposit detection to settlement. This is one observed test, not a latency guarantee.
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
- Live mobile acceptance passed: the user connected MetaMask through Reown on Base Sepolia, completed checkout, and Pelargo itself displayed Settled, Provider SUCCESS and Settlement check verified. The latest settled Preview record is ORDER-49053014, a strong temporal match but not explicitly confirmed by the user. Its NEAR destination transaction is `3uZtiZpnhUd4r2wzbmUhPHwW6CAVBfsLLwWuUyfRrZPC`; the database records 1 USDC to agentg.testnet, block 276622029 and 68 confirmations. There is no source-deposit evidence row or source transaction hash for this order.
- ORDER-49053014 took 2 minutes 20.6 seconds from order creation to settlement in recorded lifecycle events, with settlement 23.2 seconds after deposit detection. This is a single observation, not a latency guarantee.
- Remaining wallet checks: account changes, disconnect/reconnect and network-switch edge cases.

**Frontend**
- The active branch contains the redesigned merchant Overview, destination settings, checkout creation, hosted buyer checkout, Developers and account views.
- Design direction: blue-and-white, modern financial infrastructure with editorial restraint. Use real payment data and explicit lifecycle states; no mock payment progress or fabricated metrics.
- Review the complete experience on mobile and desktop, including loading, empty, error and terminal states.

**Developer integration**
- Server-side merchant session creation and the hosted checkout/embed path are documented in docs/INTEGRATION.md.
- Merchant credentials stay server-side. Buyer checkout uses a short-lived one-order bearer token.
- No stable published SDK/CDN package, Shopify/WooCommerce plugin or merchant webhook delivery is released.
- A non-payment external merchant smoke test now exists at `scripts/external-merchant-smoke.mjs`; it covers merchant-key auth, signed buyer-session validation, merchant-scoped order lookup, duplicate rejection and the pre-quote boundary.
- A manually triggered GitHub Actions workflow runs the test from a hosted Node.js runner. The primary merchant key and a second, independently issued merchant key are stored as GitHub Actions repository secrets; neither key is committed or sent through chat.
- PR #6 has been merged into `reliability/background-reconciliation`. Its external merchant acceptance workflow passed on 7 November 2026. All seven checks passed, including the second merchant's attempted lookup of the first merchant's order returning the expected 404. The workflow created a pending Preview order only; it did not commit a quote or initiate a payment or transfer. The Cloudflare Pages test Preview is `https://test-external-merchant-integ.pelargo.pages.dev`.

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

- reliability/background-reconciliation contains the integrated non-production product.
- PR #6 integrated `test/external-merchant-integration` into `reliability/background-reconciliation` on 7 November 2026.
- build/live-intents is the existing Cloudflare Pages production branch. Do not change it.
- main contains an older Google AI Studio-generated version and is not the current product source.
- External merchant test Preview URL: https://test-external-merchant-integ.pelargo.pages.dev (deployment completed and used by the passing acceptance workflow).
- A free custom domain has not yet been selected or configured.

Do not merge, move the production branch, deploy Production or change domain routing now. First finish the redesign and Reown work, complete acceptance testing, and freeze a release candidate. Then reconcile the candidate against build/live-intents, update main to the approved release, and only after explicit approval change the Cloudflare production branch and attach the chosen domain. A GitHub merge to main alone does not change the Cloudflare Pages production branch.

## Remaining work

1. Complete Reown edge-case checks for account changes, disconnect/reconnect and network switching.
2. Review all redesigned screens on mobile and desktop; verify navigation, real actions, and loading/empty/error/success states.
3. External merchant acceptance test passed on 7 November 2026: invalid-key rejection, checkout-session creation, buyer bearer validation, own-order retrieval, duplicate-reference rejection, cross-merchant isolation (second merchant receives 404), and the pre-quote payment boundary. No quote or payment was initiated by this test.
4. Verify the post-merge Cloudflare Pages Preview deployment and rerun the external merchant acceptance test against the integrated branch.
5. Complete Reown account-change, disconnect/reconnect and network-switch checks, plus full mobile/desktop UI review.
6. Consolidate submission/demo materials after acceptance.

## Release and safety constraints

- Preview/testnet only for current work. Keep ALLOW_MAINNET_DEPOSITS unset.
- Do not use the prototype to collect real customer funds.
- Do not modify Production D1 or other Production resources.
- No merge to the release/production path, Production deployment, domain-routing change, mainnet activation or payment initiation without explicit user approval.
- Do not create another payment just to repeat an already demonstrated route.
