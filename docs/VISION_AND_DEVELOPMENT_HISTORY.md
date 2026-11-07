# Pelargo: vision and development history

This document records the product direction and makes the repository's development history easier to inspect. It distinguishes the current merged release from work preserved on parallel development branches.

## Vision

Pelargo's vision is to give merchants an embeddable checkout for cross-chain payments, backed by independently verifiable settlement.

The checkout widget is the customer-facing product: merchants should be able to place it in an existing storefront or use hosted checkout, while customers pay with supported digital assets across available networks. Stablecoins such as USDC are important supported payment assets, but Pelargo is not defined as a stablecoin-only product. Asset and network coverage must be described according to implemented, provider-available routes.

Behind the widget, Pelargo owns the merchant/order lifecycle and settlement decision. A merchant should not have to treat a wallet submission, a bridge/provider status, or a transaction hash as proof that an order has been paid. The order should become paid only when evidence confirms that the expected asset reached the configured destination.

The long-term direction is a provider-independent settlement-verification layer that can sit between merchant checkout systems and multiple cross-chain execution providers. Routing can be delegated; merchant identity, order state, payment policy, evidence requirements, and the decision to mark an order paid remain explicit and auditable in Pelargo.

### Product principles

1. **Embedded checkout first.** The widget is the primary customer-facing payment surface; hosted checkout is its equivalent entry point. Merchant integration should be straightforward without moving merchant credentials into browser code.
2. **Merchant-owned order lifecycle.** Merchant identity, order binding, checkout-session validity, and paid/expired/recovery states must be controlled by Pelargo.
3. **Evidence before settlement.** A provider success response or source-chain submission is not sufficient. The expected destination asset, recipient, network, and amount must be independently checked before an order is marked paid.
4. **Non-custodial execution.** Pelargo coordinates checkout and verifies settlement; it is not presented as a custodian or as the owner of user funds.
5. **Provider separation.** A provider may supply quotes, route discovery, and deposit instructions without becoming the authority for Pelargo's merchant/order lifecycle or final settlement decision.
6. **Recoverable operations.** Reconciliation, expiry handling, audit events, and explicit recovery states are part of payment correctness, not optional operational extras.
7. **Evidence-led expansion.** New chains, assets, providers, SDKs, webhooks, and production capabilities should be added only with corresponding implementation and verification evidence.

### Current implementation versus direction

The current public demonstration is a specific testnet route: Base Sepolia ERC-20 to NEAR testnet NEP-141 through the configured Tidepool / NEAR Intents-compatible provider environment. NEAR is the destination settlement network in this flow: Pelargo verifies the expected NEP-141 transfer on NEAR before the merchant order is treated as paid. That makes NEAR part of the settlement trust boundary, rather than a cosmetic ecosystem integration. The provider assists with routing; Pelargo owns the merchant order and independently checks destination delivery. We do not claim to implement the NEAR Intents protocol itself or to provide general-purpose NEAR routing infrastructure.

The current implementation includes a custom-element embed and hosted checkout; it does not yet include a stable published SDK/CDN package, commerce-platform plugins, or merchant webhook delivery.

The broader multi-provider and multi-network direction is a product vision, not a claim that arbitrary chains, assets, providers, or mainnet routes are already supported. Current route coverage and production limitations are documented in the [README](../README.md) and [testing record](TESTING.md).

## Development history

The default branch is the curated release line. It is intentionally not a complete linear transcript of every experiment and parallel implementation branch.

During development, substantial work was carried on separate design, reliability, operations, and acceptance-test branches. The release candidate was curated and merged into `main` through PR #7 rather than merging the entire divergent branch graph. This kept the release history and deployed candidate reviewable, but it means the default branch's visible commit count understates the amount of parallel development activity.

The branches below remain public and can be inspected directly. The number is GitHub's current compare count of commits reachable from that branch but not from `main`, measured against the current `main` branch. These counts overlap because branches share history; **do not add them together** or describe their sum as a unique project commit count. They are branch-level visibility figures, not a verified count of unique commits across every ref.

| Development area | Public branch | Commits ahead of `main` |
|---|---|---:|
| Premium visual system | [design/blue-white-premium](https://github.com/BigWave45/Pelargo/tree/design/blue-white-premium) | 702 |
| Checkout widget design | [design/premium-checkout-widget](https://github.com/BigWave45/Pelargo/tree/design/premium-checkout-widget) | 503 |
| Premium workspace UI | [design/premium-ui](https://github.com/BigWave45/Pelargo/tree/design/premium-ui) | 498 |
| Live D1 readiness work | [ops/live-d1-readiness](https://github.com/BigWave45/Pelargo/tree/ops/live-d1-readiness) | 372 |
| NEAR RPC / signer reconciliation | [ops/near-rpc-signer-reconciliation](https://github.com/BigWave45/Pelargo/tree/ops/near-rpc-signer-reconciliation) | 386 |
| Settlement reconciliation fixes | [ops/settlement-reconciliation-system-fix](https://github.com/BigWave45/Pelargo/tree/ops/settlement-reconciliation-system-fix) | 390 |
| Background reconciliation | [reliability/background-reconciliation](https://github.com/BigWave45/Pelargo/tree/reliability/background-reconciliation) | 528 |
| NEAR verifier diagnostics | [reliability/near-verifier-diagnostics](https://github.com/BigWave45/Pelargo/tree/reliability/near-verifier-diagnostics) | 396 |
| External merchant acceptance | [test/external-merchant-integration](https://github.com/BigWave45/Pelargo/tree/test/external-merchant-integration) | 504 |
| Earlier live-intents implementation | [build/live-intents](https://github.com/BigWave45/Pelargo/tree/build/live-intents) | 163 |

The curated release and documentation changes are visible in [PR #7](https://github.com/BigWave45/Pelargo/pull/7) and [PR #8](https://github.com/BigWave45/Pelargo/pull/8). The [main commit history](https://github.com/BigWave45/Pelargo/commits/main/) shows the current release line; the branch links above expose the parallel work.

### How to read this history

- A branch's ahead count is not the number of commits authored exclusively for that feature; it is the number of commits in that branch's ancestry that are absent from current `main`.
- Different branches share a common base and substantial overlapping ancestry. Adding their ahead counts would double-count commits.
- A branch may contain intermediate experiments or code that was superseded. Its presence is evidence of development activity, not proof that every commit is part of the current release.
- The current supported product behavior is defined by `main`, the README, and the testing/acceptance documentation, not by every historical branch.

For the complete public record, inspect the [repository branches](https://github.com/BigWave45/Pelargo/branches) and each branch's commit history.
