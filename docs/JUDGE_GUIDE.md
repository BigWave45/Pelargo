# Pelargo judge guide

**Purpose:** a short, reproducible path for human judges and automated repository evaluators (Claude Code and Codex).  
**Public demo:** https://main.pelargo.pages.dev  
**Repository:** https://github.com/BigWave45/Pelargo  
**Scope:** isolated Cloudflare Pages Preview, Base Sepolia and NEAR testnet. This is not a production payment endpoint.

## 1. What Pelargo does

Pelargo is an embeddable merchant checkout for cross-network crypto payments. A merchant creates an order and a short-lived signed checkout session. A buyer pays from a supported source asset. Pelargo delegates route execution to its configured provider, but does not delegate the merchant's final paid decision: it independently verifies the expected NEAR NEP-141 destination transfer before marking the order paid.

**Product promise: Pay across chains. Settle on NEAR.**

NEAR is the settlement home, not a placeholder or an interchangeable destination. The demonstrated route is Base Sepolia ERC-20 to NEAR testnet NEP-141 through Tidepool's NEAR Intents-compatible testnet environment. Pelargo does not claim to implement the NEAR Intents protocol itself.

## 2. Safest way to inspect the hosted demo

Open https://main.pelargo.pages.dev.

1. Create a merchant account using a test email address and a strong password.
2. Open **Payment destination** and configure the previously verified destination:
   - Network: `NEAR`
   - Asset ID: `nep141:usdc.tidepool-sandbox.testnet`
   - Symbol: `USDC`
   - Decimals: `6`
   - Recipient: `agentg.testnet` (the recipient in the recorded evidence; an evaluator may use another testnet account they control)
3. The asset ID is the exact NEAR testnet asset recorded in Preview D1. Provider catalogue availability can change. If it is not returned by the current Tidepool testnet catalogue, do not substitute an arbitrary token or infer support from the example.
4. Create a checkout order with a unique reference and destination amount.
5. Open the signed checkout link in a separate browser tab/private window.
6. Inspect the buyer checkout. For the previously recorded Base Sepolia route, the source asset catalogue ID is `nep141:base-0x38d81431b9f76d9699af7517040d5221d9dea252.tp-omft.testnet` (USDC, 6 decimals; Base Sepolia ERC-20 contract `0x38d81431b9f76d9699af7517040d5221d9dea252`). The live Preview `/api/tokens` catalogue returned this asset on 7 November 2026 at 22:37 UTC. Select it if it is still present, provide a **source refund address** for the selected source network, then request the dry quote preview. The refund address is where a provider-side return may be directed if a route becomes refundable; it is not the merchant's NEAR receiving address and does not guarantee that a refund will be available. Use an address you control on the source network.
7. Stop at the dry quote preview. Do not request a committed quote, deposit instructions or initiate a transfer during a documentation-only review.

A dry quote is a preview. It does not create a committed provider deposit instruction or move funds. The merchant order should remain pending/unpaid. This walkthrough demonstrates merchant registration, destination configuration, signed checkout-session creation, the hosted buyer surface and dry-quote presentation. It does not itself reproduce the historical completed payment.

## 3. Previously completed end-to-end payment evidence

The strongest full source-to-destination acceptance record is `ORDER-35541967`. It is already recorded in the isolated Preview D1 database. No new payment is required to demonstrate that the project has completed an end-to-end testnet settlement.

### Source leg: Base Sepolia

- Chain: Base Sepolia (chain ID `84532`)
- Token contract: `0x38d81431b9f76d9699af7517040d5221d9dea252`
- Transaction: `0x886ff617f13d6eddb23d376eaf2437a90082b610f8c006de743b5df1a5464d5c`
- Recorded amount: `1,012,633` atomic units
- Verification source: `chain_rpc`
- Block: `55,569,210`
- Recorded confirmations at read-back: `37,260`

### Destination leg: NEAR testnet

- Network: NEAR testnet
- NEP-141 token contract: `usdc.tidepool-sandbox.testnet`
- Pelargo asset ID: `nep141:usdc.tidepool-sandbox.testnet`
- Recipient: `agentg.testnet`
- Transaction: `9myMAuSbY4NAcCWDkhZUWqQLGTW47Z2dkrxjhGgtJspS`
- Verified destination amount: `1,000,000` atomic units = **1.000000 USDC**
- Verification source: `chain_rpc`
- Block: `276,599,398`
- Recorded confirmations at read-back: `10,063`

### Persisted merchant state

A read-only Preview D1 inspection confirmed:

- `checkout_orders.status = paid`
- `payment_lifecycle.status = settled`
- `payment_lifecycle.provider_status = SUCCESS`
- `payment_lifecycle.destination_tx_candidate` equals the destination evidence transaction hash
- `payment_settlement_evidence` contains matching destination token, recipient and exact amount
- `payment_origin_deposit_evidence` contains the Base Sepolia source transfer record

The source and destination amounts are not numerically identical: the route records 1,012,633 source atomic units and delivers the merchant's configured 1,000,000 destination atomic units. Do not describe this as an amount mismatch. The merchant's destination amount is the settlement obligation; source amount is route input and includes conversion/fees.

A separate order, `ORDER-83587591`, also has persisted source-deposit and destination-settlement evidence. Its provider status remained `PROCESSING` while Pelargo's lifecycle reached `settled`. This is a separate record and must not be confused with `ORDER-35541967`.

The transaction hashes above are the primary evidence identifiers. They can be pasted into the relevant Base Sepolia and NEAR testnet block explorers. Explorer availability and confirmation counts are time-dependent; the counts above are read-back snapshots, not current guarantees.

### Additional complete payment: ORDER-71455096 (5 USDC)

This order demonstrates destination settlement followed by a later source-evidence reconciliation. The order had already reached `paid` / `settled` after Pelargo independently verified the NEAR destination transfer. The merchant then used **Verify source** to submit the original Base Sepolia transaction hash. Pelargo verified and persisted the source transfer against the committed quote without reopening or changing the existing destination settlement.

**Source leg: Base Sepolia**

- Chain: Base Sepolia (chain ID `84532`)
- Token contract: `0x38d81431b9f76d9699af7517040d5221d9dea252`
- Transaction: `0xbbccf1b245af1932f8feacb755d8574c6dd276965661123354f829ffb9f2ffd4`
- Verified transfer amount: `5,063,164` atomic units (5.063164 USDC)
- Provider deposit address: `0x3c963cda1663bc10404db6aa8fa01b6ab2367388`
- Block: `55,749,245`
- Confirmations at read-back: `112,653`
- Verification source: `chain_rpc`
- Source evidence recorded: `2026-11-07T23:30:48.263Z`

**Destination leg: NEAR testnet**

- NEP-141 token contract: `usdc.tidepool-sandbox.testnet`
- Recipient: `agentg.testnet`
- Transaction: `EhTBbho5ZWgEUL2G8X36AizRWRKWcsJTzXzV3CvxVQbm`
- Verified destination amount: `5,000,000` atomic units = **5.000000 USDC**
- Block: `276,660,519`
- Confirmations at read-back: `44`
- Verification source: `chain_rpc`
- Destination evidence recorded: `2026-11-07T17:16:00.490Z`

**Persisted lifecycle and reconciliation result**

- Merchant order reference: `ORDER-71455096`
- Internal order ID: `3280f1e0-a24f-4fa4-9171-b54808e9d52a`
- `checkout_orders.status = paid`; `payment_lifecycle.status = settled`
- Source and destination evidence now reference the same internal order ID.
- Destination settlement was recorded before the later source-evidence verification. Source verification did not reopen the order or alter its paid/settled state.
- The verification response shown by the merchant workspace stated that the provider was not notified again. The persisted order state and evidence were confirmed with read-only Preview D1 queries.
- Source input (5.063164 USDC) and merchant destination obligation (5.000000 USDC) differ because the route includes conversion and fees. This is not a settlement mismatch.

This record demonstrates that source provenance can be reconciled after destination settlement while the NEAR settlement remains the authoritative paid-state evidence. No additional payment is needed to reproduce it.

## 4. Merchant reconciliation: Check status vs Verify source

The merchant order table exposes two different reconciliation actions. They answer different questions and should not be treated as interchangeable.

### Check status

Use **Check status** to ask Pelargo to reconcile the order's current payment state. Pelargo queries the configured provider for the latest route status and, when destination evidence is available, independently checks the candidate NEAR transaction against the order's configured NEP-141 token, recipient and exact destination amount. A provider `SUCCESS` response by itself does not mark the order paid. A matching finalized NEAR transfer is the settlement condition. For an order already settled, the endpoint returns the persisted immutable settlement evidence rather than polling the provider again.

This action helps the merchant determine what happened to the order: still awaiting a deposit, processing, failed/refunded/incomplete according to provider state, awaiting destination verification, or settled with verified NEAR evidence. Provider status and Pelargo lifecycle status are separate fields; neither should be inferred from the other.

### Verify source

Use **Verify source** when the merchant has the buyer's original Base Sepolia transaction hash and wants to reconcile the source leg. The merchant enters the hash against the relevant order. Pelargo checks that the transaction matches the committed quote, including the expected ERC-20 token contract, provider deposit address and exact quoted source amount, then persists source-deposit evidence and checks/notifies the provider as appropriate.

This is a separate provenance check. It does not initiate another transfer, resubmit a deposit that the provider already marked successful, reopen settlement, or change an existing paid/settled state. It can record missing source evidence after destination settlement has already completed. A source transaction hash supplied by itself is not accepted as evidence; the chain transfer must match the quote.

**The distinction:** NEAR destination verification answers whether the merchant received the required destination funds. Source-hash reconciliation records and verifies the origin of the buyer's payment. The current design does not require a source-evidence row to exist before the NEAR destination settlement path can mark an order settled.

## 5. What is enforced in code and tested

The README architecture and `docs/TESTING.md` describe the details. The key boundary is:

- Provider `SUCCESS` is a candidate signal, not settlement proof.
- Pelargo verifies final NEAR execution and the expected NEP-141 token contract, recipient and exact atomic amount.
- A missing, mismatched or temporarily unverifiable transfer does not settle the order.
- Settlement evidence is persisted and protected by database guards; the evidence rows are immutable.
- Automated adversarial tests cover provider SUCCESS with a wrong finalized transfer amount, verifier outage, atomic settlement-write rollback and a positive control where matching finalized evidence settles even when provider status remains PROCESSING.

Those adversarial cases are automated tests using mocked provider/RPC responses and an in-memory migrated database. They prove the application's tested decision boundary, not live-provider fault injection.

## 6. Automated checks for Claude Code and Codex

The repository's CI workflow runs these checks:

```bash
bun install --frozen-lockfile
bun run lint
bun run test:security
bun run test:api
bun run build
```

Expected intent:

- `bun run lint`: TypeScript type-check.
- `bun run test:security`: signed checkout-session security assertions.
- `bun run test:api`: API, merchant isolation, lifecycle, provider adapter, source verification, NEAR settlement verification and reconciliation concurrency assertions against an in-memory database with mocked upstreams.
- `bun run build`: application and embedded-widget production builds.

The hosted external-merchant smoke test is separate. It requires test merchant API keys supplied through environment variables and creates a pending order on the integrated Preview. It does not commit a quote, request deposit instructions or transfer funds. CI syntax-checks the script; the recorded hosted acceptance run passed seven checks. Do not run it without the required test credentials.

## 7. Deployment and environment boundaries

- Judge-facing merged-main Preview: https://main.pelargo.pages.dev
- Integrated development/acceptance Preview: https://reliability-background-recon.pelargo.pages.dev
- Cloudflare Pages production branch: `build/live-intents`
- Production hostname: https://pelargo.pages.dev

The public judge demo is a Preview deployment with isolated Preview D1. It is not the production hostname and must not receive real customer funds. Do not switch the production branch or modify Production D1 to evaluate the hackathon submission.

The Preview reconciliation Worker `pelargo-expiry-sweeper-preview` is deployed with the isolated Preview D1 binding, encrypted reconciliation secret and five-minute Cron Trigger. The Preview migration ledger contains migrations 0001–0020. Six eligible `awaiting_deposit` records with deposit addresses had corresponding reconciliation queue rows at read-back. This proves deployment/configuration and queued work. It does not prove a scheduled invocation has claimed and successfully processed an eligible payment; no live scheduled-job success is claimed.

## 8. Limitations that should not be hidden

- The demonstrated route is specific: Base Sepolia ERC-20 to NEAR testnet NEP-141 through Tidepool.
- Provider token availability and route liquidity are dynamic.
- Mainnet committed quotes are disabled.
- The official 1Click adapter is separate and mainnet-only in the current implementation; it is not the current testnet execution path.
- Arbitrary-chain settlement verification, automatic provider failover, route comparison, Pelargo-operated liquidity, merchant webhooks, stable published SDK/CDN packaging and commerce-platform plugins are not currently claimed.
- The embedded custom element exists in the repository, but it is not a stable published SDK/CDN package.
- Mobile wallet acceptance is manual and not exhaustive across browser/wallet combinations.
- Scheduled Worker configuration is verified; successful scheduled processing of a real eligible job remains unverified.
- Production/mainnet readiness is not claimed.

## 9. Source-of-truth documents

- [README](../README.md): product positioning, architecture, demo and release state.
- [Scope](../SCOPE.md): implemented scope, operational status and remaining work.
- [Integration guide](INTEGRATION.md): merchant integration, endpoints, security and deployment requirements.
- [Testing and acceptance record](TESTING.md): automated tests, hosted acceptance, payment evidence and limitations.
- [Project status](PROJECT_STATUS.md): branch, Preview deployment and release record.
- [Vision and development history](VISION_AND_DEVELOPMENT_HISTORY.md): long-term NEAR settlement thesis and parallel branch history.
- [Architecture](architecture.md): component responsibilities and NEAR settlement boundary.
- [Threat model](threat-model.md): trust assumptions, tested controls and residual risks.
- [Verification matrix](verification-matrix.md): what each evidence source does and does not prove.
- [NEAR Hackathon notes](../HACKATHON.md): track fit and submission requirements.
