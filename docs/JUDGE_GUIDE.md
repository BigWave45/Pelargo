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
6. Inspect the buyer checkout and request a dry quote preview for a currently listed Base Sepolia asset.
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

## 4. What is enforced in code and tested

The README architecture and `docs/TESTING.md` describe the details. The key boundary is:

- Provider `SUCCESS` is a candidate signal, not settlement proof.
- Pelargo verifies final NEAR execution and the expected NEP-141 token contract, recipient and exact atomic amount.
- A missing, mismatched or temporarily unverifiable transfer does not settle the order.
- Settlement evidence is persisted and protected by database guards; the evidence rows are immutable.
- Automated adversarial tests cover provider SUCCESS with a wrong finalized transfer amount, verifier outage, atomic settlement-write rollback and a positive control where matching finalized evidence settles even when provider status remains PROCESSING.

Those adversarial cases are automated tests using mocked provider/RPC responses and an in-memory migrated database. They prove the application's tested decision boundary, not live-provider fault injection.

## 5. Automated checks for Claude Code and Codex

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

## 6. Deployment and environment boundaries

- Judge-facing merged-main Preview: https://main.pelargo.pages.dev
- Integrated development/acceptance Preview: https://reliability-background-recon.pelargo.pages.dev
- Cloudflare Pages production branch: `build/live-intents`
- Production hostname: https://pelargo.pages.dev

The public judge demo is a Preview deployment with isolated Preview D1. It is not the production hostname and must not receive real customer funds. Do not switch the production branch or modify Production D1 to evaluate the hackathon submission.

The Preview reconciliation Worker `pelargo-expiry-sweeper-preview` is deployed with the isolated Preview D1 binding, encrypted reconciliation secret and five-minute Cron Trigger. The Preview migration ledger contains migrations 0001–0020. Six eligible `awaiting_deposit` records with deposit addresses had corresponding reconciliation queue rows at read-back. This proves deployment/configuration and queued work. It does not prove a scheduled invocation has claimed and successfully processed an eligible payment; no live scheduled-job success is claimed.

## 7. Limitations that should not be hidden

- The demonstrated route is specific: Base Sepolia ERC-20 to NEAR testnet NEP-141 through Tidepool.
- Provider token availability and route liquidity are dynamic.
- Mainnet committed quotes are disabled.
- The official 1Click adapter is separate and mainnet-only in the current implementation; it is not the current testnet execution path.
- Arbitrary-chain settlement verification, automatic provider failover, route comparison, Pelargo-operated liquidity, merchant webhooks, stable published SDK/CDN packaging and commerce-platform plugins are not currently claimed.
- The embedded custom element exists in the repository, but it is not a stable published SDK/CDN package.
- Mobile wallet acceptance is manual and not exhaustive across browser/wallet combinations.
- Scheduled Worker configuration is verified; successful scheduled processing of a real eligible job remains unverified.
- Production/mainnet readiness is not claimed.

## 8. Source-of-truth documents

- [README](../README.md): product positioning, architecture, demo and release state.
- [Scope](../SCOPE.md): implemented scope, operational status and remaining work.
- [Integration guide](INTEGRATION.md): merchant integration, endpoints, security and deployment requirements.
- [Testing and acceptance record](TESTING.md): automated tests, hosted acceptance, payment evidence and limitations.
- [Project status](PROJECT_STATUS.md): branch, Preview deployment and release record.
- [Vision and development history](VISION_AND_DEVELOPMENT_HISTORY.md): long-term NEAR settlement thesis and parallel branch history.
