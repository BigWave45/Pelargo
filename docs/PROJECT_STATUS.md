# Pelargo release status

**Updated:** 10 November 2026 (no-signup judge demo merged and Preview deployment verified)  
**Repository:** https://github.com/BigWave45/Pelargo  
**Default branch:** `main`  
**Merged release baseline:** `main` (PR #7 release consolidation; documentation and judge-readiness updates through PR #20)  
**Integrated Preview:** `reliability/background-reconciliation`  
**Cloudflare Pages production branch:** `build/live-intents`

## Canonical release state

- PR #7, "Release candidate: consolidate verified Pelargo checkout", was merged into `main`.
- Documentation and metadata PRs #8–#19 are merged. PR #20 adds an isolated, no-signup, read-only judge evidence route. PR #16 added the Cascade-benchmarked judge guide, hackathon mapping, architecture, threat model and verification matrix. PR #17 clarified merchant reconciliation actions and the source refund address.
- Latest judge-demo merge commit: `2afa9250ed446f6c6a804bc63d0073bc8e8a63f3` (PR #20).
- The merged release includes the verified MetaMask Connect SDK handoff for external mobile browsers, the injected EIP-1193 provider path inside MetaMask Mobile, Reown AppKit for other supported wallet sessions, matching package/lock files, and aligned README, integration, testing and status documentation.
- The historical integrated branch's 500+ commit history was not merged wholesale. PR #4 remains closed and unused.
- The GitHub repository's default branch is `main`.

## Cloudflare deployment state

Cloudflare Pages project: `pelargo`.

- Production branch remains `build/live-intents`.
- The stable built-in hostname `https://pelargo.pages.dev` remains attached to the existing production deployment. It has not been switched.
- The latest `main` Preview deployment is successful and serves merge commit `2afa9250ed446f6c6a804bc63d0073bc8e8a63f3`.
- That deployment is a Preview environment and uses Preview D1 database `0335acdc-f0e0-42f6-ba87-e3448fb91728`.
- The older candidate alias remains `https://release-hackathon-candidate.pelargo.pages.dev`.
- The integrated acceptance Preview remains `https://reliability-background-recon.pelargo.pages.dev`; it is not the recommended judge-facing demo.
- The latest verified Preview deployment is `e4b028a6-50ba-4638-a096-97bd9850d39b` (`https://e4b028a6.pelargo.pages.dev`), with alias `https://main.pelargo.pages.dev`. Build and deploy stages both succeeded. A GitHub merge or successful Preview deployment does not change the Cloudflare production branch or production database.

**Recommended public demo URL:** https://main.pelargo.pages.dev  
**No-signup judge evidence route:** https://main.pelargo.pages.dev/judge-demo

The judge route is a static, read-only presentation of two historical completed testnet payment records. It does not require merchant signup and does not call merchant APIs, providers, D1, wallet, quote, or reconciliation actions. It is not a live payment demo and does not establish current provider availability. The main app remains available at the root URL with its existing merchant sign-in and account-creation flow. Both URLs serve a Preview/testnet deployment, not production. Do not direct real customer funds to it.

## Production promotion is separate

The Pages production branch is still `build/live-intents`, with its own production D1 binding. The old production branch has a divergent history from the merged release candidate. Do not simply change the production branch to `main` or assume the production D1 schema/data is compatible.

Before any production promotion, inspect and reconcile:
1. The production branch's code and migrations against merged `main`.
2. Production D1 schema and data compatibility, using a reviewed migration plan.
3. Required production secrets and provider/RPC configuration.
4. A rollback plan for code and database changes.

No production branch change, production D1 read/write, production deployment, mainnet activation, paid domain purchase or custom-domain change was performed as part of PR #7 or this status update.

## Product and supported scope

Pelargo is a merchant-first, non-custodial crypto checkout and settlement-verification layer. Merchants create orders and short-lived buyer sessions; buyers pay through a supported provider route; Pelargo independently verifies destination settlement before marking an order paid.

The demonstrated Preview route is a provider-supported Base Sepolia ERC-20 source asset to NEAR testnet NEP-141 destination asset through the Tidepool / NEAR Intents-compatible testnet environment. This is a specific testnet route, not universal chain/token support. Mainnet committed quotes remain disabled.

## Verified acceptance

- `ORDER-35541967`: complete dual-chain evidence for 1 USDC delivered to `agentg.testnet`, including Base Sepolia source-deposit evidence and independently verified NEAR destination-settlement evidence. Preview D1 read-back confirms order `paid`, lifecycle `settled`, provider `SUCCESS`, and matching destination candidate/evidence transaction `9myMAuSbY4NAcCWDkhZUWqQLGTW47Z2dkrxjhGgtJspS` for 1,000,000 atomic destination units.
- `ORDER-71455096`: complete dual-chain evidence for 5 USDC delivered to `agentg.testnet`. Base Sepolia source transaction `0xbbccf1b245af1932f8feacb755d8574c6dd276965661123354f829ffb9f2ffd4` (5,063,164 atomic units) and NEAR destination transaction `EhTBbho5ZWgEUL2G8X36AizRWRKWcsJTzXzV3CvxVQbm` (5,000,000 atomic units) are now persisted against the same order ID. Source evidence was verified after destination settlement; the paid/settled state remained unchanged. The merchant verification response stated that the provider was not notified again.
- `ORDER-83587591`: separate destination settlement evidence for 1 USDC to `agentg.testnet`, verified through canonical NEAR RPC. It also has a Base Sepolia source-deposit evidence record; the source amount is 1,012,633 atomic units while destination settlement is 1,000,000 atomic units. It is a separate record and not a contradiction of `ORDER-35541967`.
- `ORDER-68886375`: user-confirmed external iPhone browser to MetaMask app handoff and completed Preview checkout. Preview confirms paid/settled, provider SUCCESS and independently verified NEAR destination evidence for 1 USDC to `agentg.testnet`. No source-deposit evidence row is recorded for this order; do not describe it as complete dual-chain evidence.
- External merchant acceptance passed all seven hosted checks, including invalid-key rejection, session validation, merchant-scoped retrieval, duplicate reference rejection, pre-quote payment boundary and cross-merchant isolation. The smoke test creates a pending Preview order only and does not initiate a payment.
- Automated CI covers type-checking, checkout-session security, API/lifecycle behavior, provider SUCCESS versus settlement evidence, Base Sepolia source-deposit verification, NEAR destination verification, reconciliation job concurrency and frontend build.
- Latest merchant workspace snapshot: 10 orders, 0 in progress, 4 settled and 6 expired/needs attention. Read-only Preview D1 inspection confirmed four paid/settled orders and six expired orders. These are point-in-time counts, not fixed acceptance-test expectations.

## Preview reconciliation Worker

Read-only Cloudflare configuration inspection on 7 November 2026 confirms Worker `pelargo-expiry-sweeper-preview` exists, has the encrypted `RECONCILIATION_SECRET` binding, uses Preview D1 `0335acdc-f0e0-42f6-ba87-e3448fb91728`, has Tidepool testnet configuration and has Cron `*/5 * * * *`. The Preview D1 migration ledger includes migrations 0019 and 0020; schema inspection confirms persisted signer-scan fields. A read-only queue query found six `awaiting_deposit` jobs and no missing queue rows for that eligible state. This proves deployment/configuration and queued work, not that a scheduled invocation has claimed or successfully processed a real eligible payment. No live scheduled-job success is claimed.

See [TESTING.md](TESTING.md) for the full evidence record and limitations. See [JUDGE_GUIDE.md](JUDGE_GUIDE.md) for the safe evaluator path, [architecture.md](architecture.md) for system boundaries, [threat-model.md](threat-model.md) for risks, and [verification-matrix.md](verification-matrix.md) for evidence classification.

## Safety and limitations

All demonstrated payment activity is testnet activity. Keep `ALLOW_MAINNET_DEPOSITS` unset. Do not use Preview to collect customer funds. Provider status, a quote, a deposit address or a submitted wallet transaction hash is not settlement proof. Do not claim universal chain/token support, production readiness, automatic provider failover, merchant webhook delivery or guaranteed settlement times.

No additional payment is needed merely to repeat the demonstrated route.
