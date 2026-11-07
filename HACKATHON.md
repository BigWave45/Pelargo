# NEAR HACKATHON submission notes

This file maps Pelargo's implemented prototype to the public NEAR HACKATHON brief. It is a project-specific explanation, not a replacement for the organizer's rules.

- Official event and submission instructions: https://nearhackathon.com/
- Official builder guidance: https://nearhackathon.com/HACKATHON.md
- Repository: https://github.com/BigWave45/Pelargo
- Public judge demo: https://main.pelargo.pages.dev

## Best-fit track: 08 / Real-World Money

The official track describes payroll, invoicing, remittances, merchant payments and stablecoin rails for real businesses. Pelargo fits the merchant-payments part of that brief: it provides an embeddable checkout and merchant order lifecycle for cross-network crypto payments, with NEAR as the settlement home.

**Product statement:** Pay across chains. Settle on NEAR.

A merchant creates an order and checkout session. A buyer pays from a supported source asset. Pelargo coordinates a provider-assisted route, then independently verifies the expected NEAR NEP-141 destination transfer before marking the order paid.

The demonstrated route is Base Sepolia ERC-20 to NEAR testnet NEP-141 through Tidepool's NEAR Intents-compatible testnet environment. Pelargo does not claim to implement NEAR Intents itself, support arbitrary chains, or operate production/mainnet payments.

## Why NEAR is central

NEAR is the product's intended settlement network, not an optional destination in a list. The demonstrated route moves testnet payment value from Base Sepolia into a NEAR testnet NEP-141 asset. Pelargo verifies the destination transfer against canonical NEAR chain data and binds it to the merchant's expected token, recipient and amount.

The economic thesis is that a useful cross-network checkout can bring merchant payment activity and supported asset settlement onto NEAR. This is a design objective and a plausible adoption mechanism, not evidence of merchant volume, ecosystem growth or production economic impact today.

## What is implemented and evidenced

- Merchant registration, authentication, workspace and destination configuration in the hosted Preview.
- Merchant-scoped order APIs and short-lived signed buyer checkout sessions.
- Embedded custom-element checkout and hosted checkout surface.
- Provider asset discovery and dry quote preview.
- Explicit committed-quote and deposit-instruction flow in the implementation; judges reviewing documentation should stop at dry quote preview.
- Eligible Base Sepolia ERC-20 wallet transfer path and manual deposit-address path.
- Base Sepolia source-deposit verification for the configured route.
- Independent NEAR testnet NEP-141 destination settlement verification.
- Persisted settlement evidence and paid/settled lifecycle transition.
- Reconciliation and recovery code, with the distinction between configured Preview Worker and unverified scheduled-run success documented explicitly.

The strongest completed source-to-destination acceptance record is ORDER-35541967. It includes Base Sepolia source-deposit evidence, matching finalized NEAR destination evidence for 1 USDC to agentg.testnet, and the corresponding persisted paid/settled merchant state. See [the judge guide](docs/JUDGE_GUIDE.md) and [verification matrix](docs/verification-matrix.md).

## What is not claimed

- Production or mainnet payment operation.
- Universal chain, token or route coverage.
- Pelargo-owned cross-chain liquidity or routing infrastructure.
- Implementation of the NEAR Intents protocol itself.
- A Pelargo-owned NEAR settlement contract or on-chain merchant receipt.
- Automatic provider failover, route comparison or guaranteed settlement times.
- Stable published SDK/CDN package, Shopify/WooCommerce plugins or merchant webhook delivery.
- Successful scheduled reconciliation of a real eligible payment.
- Proven merchant adoption, transaction volume or measurable NEAR ecosystem growth.

## Judge path

1. Read the [README](README.md) for the product and architecture overview.
2. Open the [hosted judge demo](https://main.pelargo.pages.dev) and follow the no-funds walkthrough in [docs/JUDGE_GUIDE.md](docs/JUDGE_GUIDE.md). Stop at dry quote preview.
3. Inspect the completed ORDER-35541967 source and destination transaction evidence and persisted merchant state in the judge guide.
4. Read [docs/architecture.md](docs/architecture.md), [docs/threat-model.md](docs/threat-model.md) and [docs/verification-matrix.md](docs/verification-matrix.md) for system boundaries, risks and evidence classification.
5. Review [docs/TESTING.md](docs/TESTING.md) for automated checks and adversarial settlement cases.

## Official evaluation context

The official event page says Claude Code and Codex screen projects first to check whether they run and do what the README claims; human judges make the decisions. It names five evaluation dimensions from previous NEAR hackathons: technical implementation, design, impact, originality and sustainability. The page does not publish numeric weights for those dimensions. This document therefore does not assign invented scores or weights.

## Submission checklist

The official event page currently requires:

- [ ] Public repository.
- [ ] Public demo post on X stating that the project was built at NEAR HACKATHON.
- [ ] Tag @NEARProtocol and include #NEARHackathon.
- [ ] Attach the demo video or screenshots to the public post.
- [ ] Submit the repository link and demo-post link through the official form before 14 November 2026, 23:59 UTC.
- [ ] Enter a NEAR account address for prize delivery if selected.

One submission is allowed per project. The official FAQ says a wallet connection is not required to submit; the form asks for a NEAR account address. Check the official site again before submission in case organizer instructions change.

## Project demo and source

- Demo: https://main.pelargo.pages.dev
- Repository: https://github.com/BigWave45/Pelargo
- Primary evidence record: ORDER-35541967
- Primary track: 08 / Real-World Money
