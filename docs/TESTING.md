# Testing and acceptance record

**Last consolidated:** 7 November 2026  
**Scope:** Preview/testnet implementation. This record distinguishes automated assertions, hosted acceptance checks and user-observed manual tests. Passing tests do not establish production readiness.

## Automated CI

The GitHub Actions CI workflow runs on pushes and pull requests. Its required checks are:

- Dependency installation with the frozen Bun lockfile.
- Type-check/lint via `bun run lint`.
- Checkout-session security tests via `bun run test:security`.
- Checkout/API integration tests via `bun run test:api`.
- Syntax validation of the external merchant smoke-test script.
- Frontend production build via `bun run build`.

The exact release-candidate head `c1ad819331f2c037496f7253b09e94cb483c604c` passed GitHub Actions CI run 809 before merge. All nine workflow steps passed, including dependency installation, type-check/lint, checkout-session security tests, checkout/API integration tests, external merchant smoke-test syntax validation and frontend production build: https://github.com/BigWave45/Pelargo/actions/runs/42396665675. PR #7 then merged that exact head into `main` at `d18ae93a3eda3263eadc420cb951f4ebe52b2764`. Cloudflare Pages successfully built and deployed that merge commit as a Preview deployment using the isolated Preview D1 binding. README and release-status documentation were subsequently updated on `main`; those documentation commits trigger additional Preview builds but do not change application code. CI success is not a substitute for hosted end-to-end acceptance.

## Automated security and API coverage

Source of truth: `scripts/verify-checkout-session.ts` and `scripts/verify-checkout-api.mjs`.

Checkout-session security assertions cover valid signature verification, preservation of signed amount claims, tampered-signature rejection, expiry rejection, explicit expired-token recovery validation, wrong-secret rejection and missing-secret rejection.

The API integration suite runs against an in-memory SQLite database with the repository migrations. Its assertions cover:

- Self-service merchant registration, HttpOnly session issuance, case-insensitive duplicate-email rejection, valid/invalid login, session lookup, logout and session revocation.
- Password-reset request response, one-time token redemption, password update, prior-session revocation, token replay rejection and denial outside the exact Preview host.
- Operator provisioning authorization, merchant API-key entropy and hash-at-rest, invalid merchant-key rejection and inactive-merchant rejection.
- Signed checkout-session issuance, missing-signing-secret fail-closed behavior, expiry enforcement, token retrieval and duplicate-order rejection.
- Merchant-scoped order access, including rejection of cross-merchant access.
- Provider adapter allowlisting, testnet/mainnet separation and prevention of mainnet JWT leakage to the Tidepool testnet adapter.
- Payment lifecycle initialization, transition validation, audit events, quote binding and provider status persistence.
- Adversarial provider-SUCCESS settlement checks: a finalized NEAR transaction with the wrong transfer amount leaves the lifecycle in `processing`, writes no settlement evidence, and cannot bypass the database candidate/evidence guard. A verifier outage also leaves the order unsettled; a forced failure during the atomic settlement batch rolls back both evidence and lifecycle settlement writes. A separate positive case confirms that exact finalized NEP-141 evidence can settle even while the provider still reports `PROCESSING`.
- NEAR NEP-141 settlement verification for final execution, exact token contract, recipient, amount and evidence binding.
- Source-chain deposit verification for the configured Base Sepolia ERC-20 route, including exact token/recipient/amount checks and rejection before provider notification when the source amount is wrong.
- Reconciliation-job claiming, concurrent worker invocations, lease expiry/recovery, timeout handling, internal-worker authentication and cleanup after terminal lifecycle states.
- Mainnet commit/deposit guard behavior and fail-closed handling for unsupported provider origins or missing secrets.

These are code-level integration tests with mocked provider/RPC responses and an in-memory database. They verify application logic and regression behavior; they do not prove that every external provider, RPC, chain or Worker failure mode has been exercised against live infrastructure.

## Provider SUCCESS is not settlement proof

The API integration test in `scripts/verify-checkout-api.mjs` exercises an adversarial provider response. The provider reports `SUCCESS`, but the finalized NEAR transaction contains a transfer that does not match the order's expected amount. Pelargo must:

1. Keep the payment lifecycle at `processing`, not `settled`.
2. Return the candidate-specific mismatch diagnostic (`exact_nep141_net_transfer_not_found`).
3. Write zero rows to `payment_settlement_evidence`.
4. Reject a direct evidence insert for a stale or non-matching candidate through the database guard.

The same test suite also forces the NEAR verifier to become unavailable and confirms that the order remains in `processing`. It then forces the atomic settlement batch to fail and confirms that neither the evidence row nor the paid/settled lifecycle update survives. Finally, a positive control verifies that a matching finalized NEP-141 transfer can settle the order even when the provider status is only `PROCESSING`.

These are deterministic mocked-provider and mocked-RPC tests against the in-memory migrated database. They demonstrate the application's decision boundary; they are not live-provider fault-injection tests.

## Hosted external-merchant acceptance

Source of truth: `scripts/external-merchant-smoke.mjs` and the GitHub Actions workflow `External merchant acceptance`.

The post-merge acceptance run on 7 November 2026 passed all seven checks against the integrated Preview:

1. Invalid merchant API key rejected.
2. Merchant creates a checkout session.
3. Buyer bearer session validates.
4. Merchant retrieves its own pending order.
5. Duplicate external order reference rejected.
6. A second merchant cannot retrieve the first merchant's order (HTTP 404).
7. An order without a committed quote has no payment/deposit status.

This test creates a pending Preview order only. It does not commit a quote, request deposit instructions, connect a wallet, initiate a transfer or prove settlement.

## Hosted payment and wallet acceptance

- `ORDER-35541967`: completed Base Sepolia USDC to NEAR testnet USDC route. Preview D1 read-back confirms order `paid`, lifecycle `settled`, provider status `SUCCESS`, source evidence on Base Sepolia (transaction `0x886ff617f13d6eddb23d376eaf2437a90082b610f8c006de743b5df1a5464d5c`, token contract `0x38d81431b9f76d9699af7517040d5221d9dea252`, 1,012,633 atomic units), and independently verified NEAR destination evidence (transaction `9myMAuSbY4NAcCWDkhZUWqQLGTW47Z2dkrxjhGgtJspS`, token contract `usdc.tidepool-sandbox.testnet`, recipient `agentg.testnet`, 1,000,000 atomic units / 1 USDC, block 276599398, 10,063 confirmations at read-back). The destination candidate hash matches the persisted settlement evidence hash. This is the strongest complete dual-chain payment evidence in the current record. Source and destination atomic amounts are not equal because the route includes conversion/fees; the merchant's configured destination amount is the settlement obligation.
- `ORDER-83587591`: separate paid/settled order with canonical NEAR RPC destination evidence for 1,000,000 atomic units / 1 USDC to `agentg.testnet` (transaction `vif8EKtCAzHcaihLNuC6XaRMhCzEDxUiHbAJJRQVUVE`, block 276344867, 120,256 confirmations at read-back). It also has a Base Sepolia source-deposit evidence row for 1,012,633 atomic units. Its lifecycle reached `settled` while the persisted provider status remained `PROCESSING`; this illustrates that Pelargo's settlement decision is separate from provider status. It is a separate order from `ORDER-35541967` and must not be conflated with it.
- `ORDER-45723806`: recorded as paid/settled with destination evidence, but no source-deposit evidence row is recorded. Do not describe it as complete dual-chain evidence.
- `ORDER-68886375`: user-confirmed successful checkout from the external iPhone browser after the MetaMask Connect SDK integration. The user reports that MetaMask opened, the transaction completed, deposit detection was fast, and the merchant dashboard also displayed `Settled`. Preview D1 confirms order status `paid`, lifecycle status `settled`, provider status `SUCCESS`, and independently verified NEAR NEP-141 destination evidence for exactly 1 USDC to `agentg.testnet`: transaction `8Fk5Qcckscd9No9UhybLsgxqBsN62vpw51KLpDX38973`, block 276656102, 80 confirmations, verification source `chain_rpc`. Destination verification timestamp: 2026-11-07 16:31:49.321 UTC; order creation timestamp: 16:28:54.000 UTC (2 minutes 55.321 seconds create-to-settlement). No matching Base Sepolia origin-deposit evidence row is present for this order, so it is not complete dual-chain evidence. This is user-observed manual mobile acceptance plus server-side destination evidence, not an automated browser test.
- `ORDER-49053014`: a strong temporal match to the earlier user-reported Reown/MetaMask mobile checkout. It records 1 USDC delivered to `agentg.testnet` and independently verified destination transaction `3uZtiZpnhUd4r2wzbmUhPHwW6CAVBfsLLwWuUyfRrZPC` (block 276622029; 68 confirmations). The user has not explicitly confirmed this order ID, and no source-deposit evidence row or source transaction hash is recorded. Do not claim complete dual-chain evidence for this order.
- The user previously reported completing a mobile checkout using MetaMask through Reown on Base Sepolia. The checkout UI displayed `Settled`, provider `SUCCESS` and settlement check `verified`. This is a user-observed manual acceptance, not an automated browser test.
- The observed ORDER-49053014 lifecycle duration was 2 minutes 20.6 seconds from order creation to settlement, including 23.2 seconds from deposit detection to settlement. This is one observation, not a latency benchmark or guarantee.

No additional payment is required merely to repeat the demonstrated route.

## Preview merchant workspace status snapshot

Observed on 7 November 2026 at 16:49 UTC in the integrated Preview merchant workspace:

- All orders: **9**
- In progress: **0**
- Settled: **3**
- Needs attention: **6**

The Preview D1 cross-check confirmed that the six needs-attention orders were all terminal: `checkout_orders.status = expired` and `payment_lifecycle.status = expired` for all six. The three settled orders had `checkout_orders.status = paid` and `payment_lifecycle.status = settled`. These are point-in-time workspace counts, not hard-coded CI expectations; future tests should assert lifecycle consistency and derive counts from the fixture/database rather than assume these exact totals.

### Provider status and Pelargo lifecycle are separate fields

A provider status is an externally reported status persisted by the provider adapter. `payment_lifecycle.status` is Pelargo's own lifecycle state. They are not interchangeable: a provider status is not Pelargo's response, and a Pelargo lifecycle state must not be described as a provider-reported result. In particular, Pelargo requires independently verified destination-chain settlement evidence; provider `SUCCESS` alone is not sufficient to mark a payment settled.

A read-only Preview D1 snapshot of the same nine orders showed:

- All six expired orders had `provider_status = NULL` and `provider_updated_at = NULL`. The database therefore contains no persisted provider status for these six orders. Their expired state is Pelargo's recorded lifecycle outcome; this snapshot does not establish that the provider returned `FAILED`, reported a limitation, or caused the expiry.
- Two settled orders had persisted `provider_status = SUCCESS`.
- One settled order, `ORDER-51017560`, had persisted `provider_status = PROCESSING` while its Pelargo order/lifecycle states were `paid`/`settled`.

The `ORDER-51017560` combination is a status discrepancy that requires investigation against its provider-status update history, reconciliation events and destination evidence before drawing a conclusion. Do not normalize it as an expected provider response or use it as evidence of a provider limitation. These provider fields are a point-in-time database snapshot, not a complete record of every raw provider payload or response. The exact provider response schema and adapter mapping must be established from the implementation and relevant logs before naming provider enums or interpreting a missing value.

## Deployment and scheduled-worker checks

Read-only Cloudflare inspection on 7 November 2026 confirmed the Preview Worker `pelargo-expiry-sweeper-preview` is deployed with an encrypted `RECONCILIATION_SECRET`, Tidepool testnet configuration, the isolated Preview D1 binding `0335acdc-f0e0-42f6-ba87-e3448fb91728`, and Cron `*/5 * * * *`. The Worker configuration exposes the Preview-only NEAR transaction recovery hint for `ORDER-83587591`; the verifier still checks the transaction against canonical NEAR RPC before accepting settlement evidence.

The Preview D1 migration ledger contains migrations 0001 through 0020, including `0019_reconciliation_backfill_eligible_states.sql` and `0020_persisted_near_signer_scan.sql`. Read-only schema inspection confirms the persisted signer-scan columns introduced by migration 0020. A read-only reconciliation-queue query found six `awaiting_deposit` rows with deposit addresses and all six had corresponding queue records.

These observations establish deployed configuration, applied migrations and queued eligible work. They do not establish that a scheduled invocation has claimed and successfully processed a real eligible payment. Do not claim a successful live scheduled reconciliation run without invocation-level evidence showing the job claim, processing outcome and resulting persisted state.

Cloudflare Pages Preview deployment and GitHub CI success are deployment/build evidence, not proof of production readiness.

## Not yet verified / remaining acceptance

- Reown account-change behavior.
- Reown disconnect and reconnect behavior.
- Reown network-switch and wrong-network recovery behavior.
- Full mobile and desktop UI review across loading, empty, error, pending and terminal states.
- A live scheduled reconciliation run processing a due payment and producing independently checked evidence.
- Production/mainnet operation, broad network coverage, provider failover, merchant webhooks and production customer recovery.

## Safety and interpretation

All demonstrated payment activity is testnet activity. Keep mainnet deposits disabled and do not use Preview to collect customer funds. Do not infer universal chain/token support, production readiness, provider-independent liquidity or guaranteed settlement times from this test record.

## Mobile MetaMask connection integration

- External mobile browsers use the official `@metamask/connect-evm` EVM client. The SDK is initialized before the buyer taps Connect; the tap calls `client.connect({ chainIds: ["0x14a34"] })` and the returned EIP-1193 provider is used for account, chain, balance, and transaction requests.
- The injected-provider path inside MetaMask Mobile remains in place. Reown AppKit remains the connection path for non-mobile-browser sessions and other supported wallets.
- The prior `link.metamask.io/dapp/` handoff was removed because it only opens the dapp in MetaMask's in-app browser and does not itself establish a wallet session.
- Automated CI verifies type-checking and production builds. On 7 November 2026, the user manually verified the external iPhone browser to MetaMask app handoff and completed a subsequent Preview testnet checkout (see `ORDER-68886375` above). This confirms the reported device flow on that test, but does not constitute automated browser coverage or exhaustive compatibility testing across iOS browsers and wallet versions.
