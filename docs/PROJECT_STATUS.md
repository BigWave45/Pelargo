# Pelargo release candidate status

**Updated:** 7 November 2026  
**Repository:** https://github.com/BigWave45/Pelargo  
**Release candidate:** `release/hackathon-candidate`  
**Integrated Preview:** `reliability/background-reconciliation`  
**Cloudflare Pages production branch:** `build/live-intents`

## Canonical branch strategy

Use one release path. Do not merge the historical feature branches independently into `main`.

- `main` is the current release base. It contains the integrated Pelargo application tree, but predates the final MetaMask Connect SDK integration and the latest supporting documentation.
- `reliability/background-reconciliation` is the integrated non-production Preview source. It includes the accepted blue-white design, external merchant acceptance work, MetaMask Connect SDK handoff and subsequent provider/lifecycle documentation.
- `release/hackathon-candidate` is the clean release branch created from `main`. It selectively carries the verified differences from the integrated Preview branch: package manifest and lockfile, MetaMask Connect checkout implementation, Preview AppKit metadata, README and acceptance/integration/status documentation. It deliberately does not import the old integration branch's 500+ commit history.
- `build/live-intents` is the existing Cloudflare Pages production branch. It is not the release base and must not be overwritten.
- `design/blue-white-premium` (PR #5) and `test/external-merchant-integration` (PR #6) were already merged into `reliability/background-reconciliation`.
- `design/premium-ui`, `design/premium-checkout-widget`, `ops/*` and `reliability/near-verifier-diagnostics` are historical or superseded work branches. Their changes are not to be merged separately without identifying a concrete missing change first.
- PR #4 is closed and unmerged. It targets `main` from the old integration branch and contains a very large historical commit range. Do not reopen or merge it as the release mechanism.

The release candidate is currently a fast-forward extension of `main`, with fourteen commits and no divergence (14 ahead, 0 behind `main`). At candidate head `dc742880b4d41f8bf4a2234d7fe18852673195f0`, type-checking, checkout-session security tests, checkout/API integration tests, external merchant smoke-test syntax validation and frontend build all passed in CI: https://github.com/BigWave45/Pelargo/actions/runs/42394397895. Cloudflare Pages also completed the candidate Preview deployment successfully: https://release-hackathon-candidate.pelargo.pages.dev.

## Product and supported scope

Pelargo is a merchant-first, non-custodial crypto checkout and settlement-verification layer. Merchants create orders and short-lived buyer sessions; buyers pay through a supported provider route; Pelargo independently verifies destination settlement before marking an order paid.

The demonstrated Preview route is a provider-supported Base Sepolia ERC-20 source asset to NEAR testnet NEP-141 destination asset through the Tidepool / NEAR Intents-compatible testnet environment. This is a specific testnet route, not universal chain/token support. Mainnet committed quotes remain disabled.

## Verified acceptance

- `ORDER-35541967`: complete dual-chain evidence for 1 USDC delivered to `agentg.testnet`, including Base Sepolia source-deposit evidence and independently verified NEAR destination-settlement evidence.
- `ORDER-68886375`: user-confirmed external iPhone browser to MetaMask app handoff and completed Preview checkout. Preview confirms paid/settled, provider SUCCESS and independently verified NEAR destination evidence for 1 USDC to `agentg.testnet`. No source-deposit evidence row is recorded for this order; do not describe it as complete dual-chain evidence.
- External merchant acceptance passed all seven hosted checks, including invalid-key rejection, session validation, merchant-scoped retrieval, duplicate reference rejection, pre-quote payment boundary and cross-merchant isolation. The smoke test creates a pending Preview order only and does not initiate a payment.
- Automated CI covers type-checking, checkout-session security, API/lifecycle behavior, provider SUCCESS versus settlement evidence, Base Sepolia source-deposit verification, NEAR destination verification, reconciliation job concurrency and frontend build.

See [TESTING.md](TESTING.md) for the full evidence record and limitations.

## Remaining release work

1. Keep the README, integration guide and testing record aligned with the implemented MetaMask Connect SDK handoff, injected MetaMask path, Reown fallback and exact evidence limitations.
2. Reconcile the candidate against the existing Cloudflare production baseline before any production promotion. Do not overwrite `build/live-intents` blindly.
3. The free candidate Preview alias is available at `https://release-hackathon-candidate.pelargo.pages.dev`. The built-in `pelargo.pages.dev` address still serves the existing production branch; no custom domain is required.
4. After explicit approval, merge the reviewed release candidate into GitHub `main`.
5. Only after separate explicit approval, change Cloudflare Pages production branch configuration so `pelargo.pages.dev` serves the approved release.
6. Verify the resulting public deployment without using real customer funds or enabling mainnet.

## Safety and limitations

All demonstrated payment activity is testnet activity. Keep `ALLOW_MAINNET_DEPOSITS` unset. Do not use Preview to collect customer funds. Provider status, a quote, a deposit address or a submitted wallet transaction hash is not settlement proof. Do not claim production readiness, arbitrary-chain verification, automatic provider failover, merchant webhook delivery or guaranteed settlement times.

No additional payment is needed merely to repeat the demonstrated route.
