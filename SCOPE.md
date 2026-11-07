# Pelargo — Hackathon Scope and Submission Checklist

**Current as of 7 November 2026**

## Product

Pelargo is an embeddable, non-custodial crypto checkout for merchant websites and applications. The checkout widget is the product. The merchant workspace exists to configure destination settlement and integrate the widget; Pelargo is not a storefront builder.

A merchant creates an order and checkout session on its server. The buyer selects a supported source asset, previews a dry quote, explicitly confirms a committed quote, and receives provider deposit instructions. The buyer sends the source asset manually from their own wallet. Pelargo tracks provider progress and independently verifies supported destination settlement before marking the order paid.

## Hackathon objective

Demonstrate a credible testnet checkout and settlement-verification path. This is not a production payment platform.

The implemented destination verifier supports NEAR NEP-141 tokens only. The current Preview/testnet provider is Tidepool at `https://www.usetidepool.tech`, which is NEAR Intents-compatible. The official 1Click adapter is a separate mainnet adapter; it is not the current testnet route. Routing availability does not imply that Pelargo can verify settlement on every destination chain.

## Implemented and evidenced

- [x] Merchant registration, login, session handling and merchant dashboard on Preview.
- [x] Preview password recovery successfully exercised; password updated, previous sessions revoked, and merchant sign-in confirmed. Recovery is operator-assisted through restricted Preview runtime logs; email delivery is not configured.
- [x] Merchant destination settings and merchant-scoped order APIs.
- [x] Merchant-authenticated checkout-session creation and short-lived signed buyer sessions.
- [x] Provider asset discovery, dry quote preview and explicit committed-quote flow.
- [x] Provider deposit instructions are validated and displayed; buyer sends funds from their own wallet.
- [x] Base Sepolia source-deposit verification and provider notification.
- [x] Complete dual-chain acceptance for `ORDER-35541967`: Base Sepolia source-deposit evidence and independently verified NEAR NEP-141 destination-settlement evidence for exactly 1 USDC delivered to `agentg.testnet`.
- [x] Separate destination-settlement evidence for `ORDER-83587591`: independently verified NEAR NEP-141 transfer for exactly 1 USDC to `agentg.testnet`. This order also has a source-deposit evidence record, but the source amount differs from the destination amount due to route conversion/fees; do not substitute this record for the explicitly documented `ORDER-35541967` complete dual-chain acceptance example.
- [x] Merchant dashboard access restored; the 7 November order-history view shows six records: one `settled`, three `awaiting_deposit`, and two `expired`. The three awaiting-deposit records are unpaid checkouts; the two expired records are terminal expiries. This is a dashboard observation, not a fresh D1 reconciliation.
- [x] Settled payment status handler changed to return persisted immutable evidence without polling the provider or mutating lifecycle state; regression test added. CI and Preview deployment for these latest commits still require verification.

## Implemented but not operationally verified

- [x] Preview D1 migration history includes migrations 0019 and 0020; read-only schema inspection confirms the persisted signer-scan columns from 0020.
- [x] Preview reconciliation Worker `pelargo-expiry-sweeper-preview` is deployed with encrypted `RECONCILIATION_SECRET`, the isolated Preview D1 binding `0335acdc-f0e0-42f6-ba87-e3448fb91728`, Tidepool testnet configuration and a five-minute Cron Trigger.
- [ ] A scheduled Worker invocation claims and processes an eligible job against Preview D1. Deployment, schedule and job-queue presence do not prove a successful scheduled execution.

The Worker deployment workflow is manual and guarded to `reliability/background-reconciliation`. The deployed Worker has a five-minute Cron Trigger. Its runtime also performs Preview expiry and uncertain quote-commit recovery sweeps. Do not dispatch the deployment workflow or trigger operational sweeps merely to satisfy this documentation audit.

## Remaining submission work

1. Do not repeat a payment solely to recreate the already recorded `ORDER-35541967` evidence. No additional payment is required for the documentation audit.
2. If claiming live scheduled reconciliation, obtain run-level evidence that a scheduled invocation claimed and processed an eligible job. Do not infer this from Worker deployment, Cron configuration or queued jobs.
3. Use the judge guide to inspect the hosted merchant flow, exact asset configuration and previously recorded source/destination transaction evidence.
4. Confirm the public X demo post and submission form links before the hackathon deadline; the repository state alone does not prove submission.

## Explicit non-goals

- Mainnet payment activation or production customer funds.
- Production deployment or Production D1 changes.
- More destination settlement verifiers or additional indexer providers.
- Building a proprietary transaction indexer.
- Merchant billing, multi-user organisations, email verification, API-key rotation or enterprise identity management.
- Production operations, redundancy or monitoring work beyond what is required to demonstrate the testnet flow.
- A demo storefront such as Northwind Goods.

## Safety boundaries

- Keep `ALLOW_MAINNET_DEPOSITS` unset.
- Use Tidepool testnet and verify network alignment across provider, source-deposit verifier and destination NEAR RPC.
- Never expose merchant API keys, `ORDER_SESSION_SECRET`, `RECONCILIATION_SECRET`, `MERCHANT_PROVISIONING_SECRET`, indexer credentials or one-time reset URLs.
- A quote, deposit address, detected source deposit or provider `SUCCESS` is not proof of destination settlement.
- Only persisted, matching canonical settlement evidence can justify the paid state.
- No merge to `main`, Production deployment, Production D1 mutation, Worker dispatch or new payment without the required explicit authorization.

## Repository and active branch

- Repository: https://github.com/BigWave45/Pelargo
- GitHub default/release branch: `main` (current public judge demo and merged documentation line).
- Integrated development/acceptance branch: `reliability/background-reconciliation` (diverged from `main`; not merged wholesale).
- Cloudflare Pages production branch: `build/live-intents` (separate legacy production deployment; not the hackathon demo).
- PR #4 remains closed and unmerged. Do not use it as the release integration path.

See [README.md](README.md), [docs/INTEGRATION.md](docs/INTEGRATION.md), and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for product, API and chronological engineering details.
