# Pelargo release status

**Updated:** 7 November 2026  
**Repository:** https://github.com/BigWave45/Pelargo  
**Default branch:** `main`  
**Merged release candidate:** `release/hackathon-candidate` via PR #7  
**Integrated Preview:** `reliability/background-reconciliation`  
**Cloudflare Pages production branch:** `build/live-intents`

## Canonical release state

- PR #7, "Release candidate: consolidate verified Pelargo checkout", was merged into `main`.
- Merge commit: `d18ae93a3eda3263eadc420cb951f4ebe52b2764`.
- The merged release includes the verified MetaMask Connect SDK handoff for external mobile browsers, the injected EIP-1193 provider path inside MetaMask Mobile, Reown AppKit for other supported wallet sessions, matching package/lock files, and aligned README, integration, testing and status documentation.
- The historical integrated branch's 500+ commit history was not merged wholesale. PR #4 remains closed and unused.
- The GitHub repository's default branch is `main`.

## Cloudflare deployment state

Cloudflare Pages project: `pelargo`.

- Production branch remains `build/live-intents`.
- The stable built-in hostname `https://pelargo.pages.dev` remains attached to the existing production deployment. It has not been switched.
- The merge commit `d18ae93a3eda3263eadc420cb951f4ebe52b2764` automatically produced a successful Preview deployment at `https://main.pelargo.pages.dev`.
- That deployment is a Preview environment and uses Preview D1 database `0335acdc-f0e0-42f6-ba87-e3448fb91728`.
- The older candidate alias remains `https://release-hackathon-candidate.pelargo.pages.dev`.
- The integrated acceptance Preview remains `https://reliability-background-recon.pelargo.pages.dev`.

**Recommended public demo URL:** https://main.pelargo.pages.dev

This URL is short, serves the exact merged `main` commit, and does not require a paid domain. It is still a Preview/testnet deployment, not production. Do not direct real customer funds to it.

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

- `ORDER-35541967`: complete dual-chain evidence for 1 USDC delivered to `agentg.testnet`, including Base Sepolia source-deposit evidence and independently verified NEAR destination-settlement evidence.
- `ORDER-68886375`: user-confirmed external iPhone browser to MetaMask app handoff and completed Preview checkout. Preview confirms paid/settled, provider SUCCESS and independently verified NEAR destination evidence for 1 USDC to `agentg.testnet`. No source-deposit evidence row is recorded for this order; do not describe it as complete dual-chain evidence.
- External merchant acceptance passed all seven hosted checks, including invalid-key rejection, session validation, merchant-scoped retrieval, duplicate reference rejection, pre-quote payment boundary and cross-merchant isolation. The smoke test creates a pending Preview order only and does not initiate a payment.
- Automated CI covers type-checking, checkout-session security, API/lifecycle behavior, provider SUCCESS versus settlement evidence, Base Sepolia source-deposit verification, NEAR destination verification, reconciliation job concurrency and frontend build.

See [TESTING.md](TESTING.md) for the full evidence record and limitations.

## Safety and limitations

All demonstrated payment activity is testnet activity. Keep `ALLOW_MAINNET_DEPOSITS` unset. Do not use Preview to collect customer funds. Provider status, a quote, a deposit address or a submitted wallet transaction hash is not settlement proof. Do not claim universal chain/token support, production readiness, automatic provider failover, merchant webhook delivery or guaranteed settlement times.

No additional payment is needed merely to repeat the demonstrated route.
