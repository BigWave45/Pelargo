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

The latest documented CI runs for the application-tree update and subsequent documentation commits on `main` completed successfully. CI success means these automated jobs passed for those commits; it is not a substitute for hosted end-to-end acceptance.

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
- Payment lifecycle initialization, transition validation, audit events, quote binding, provider status persistence and rejection of provider SUCCESS as sufficient settlement evidence.
- NEAR NEP-141 settlement verification and matching settlement-evidence requirements.
- Source-chain deposit verification for the configured Base Sepolia ERC-20 route, including exact token/recipient/amount checks and rejection before provider notification when the source amount is wrong.
- Reconciliation-job claiming, concurrent worker invocations, lease expiry/recovery, timeout handling, internal-worker authentication and cleanup after terminal lifecycle states.
- Mainnet commit/deposit guard behavior and fail-closed handling for unsupported provider origins or missing secrets.

These are code-level integration tests with mocked provider/RPC responses and an in-memory database. They verify application logic and regression behavior; they do not prove that every external provider, RPC, chain or Worker failure mode has been exercised against live infrastructure.

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

- `ORDER-35541967`: completed Base Sepolia USDC to NEAR testnet USDC route. Preview records both immutable source-deposit evidence and independently verified NEAR NEP-141 destination-settlement evidence. Exactly 1 USDC was delivered to `agentg.testnet`. This is the strongest complete dual-chain payment evidence in the current record.
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

The Preview reconciliation Worker deployment workflow is manual-only and guarded to the `reliability/background-reconciliation` branch. Its workflow validates Preview-only credentials, dry-runs the staged and scheduled configurations, installs the encrypted reconciliation secret, activates the five-minute Cron Trigger, and checks the deployed Worker schedule and isolated Preview D1 binding.

A successful configuration/deployment check proves that the Worker, expected Preview D1 binding and Cron schedule are configured. It does not by itself prove that a scheduled run has processed a real due payment successfully. Do not claim a successful live scheduled reconciliation run without run-level evidence.

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
