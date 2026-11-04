# Pelargo — Build Status

Last updated: 5 November 2026

## Active branch and change control

- Active development branch: `build/live-intents`.
- Repository: `BigWave45/Pelargo`.
- Keep all development changes on `build/live-intents`.
- `main` is separate and must remain untouched unless the project owner explicitly authorises a merge.
- Do not deploy production changes, enable mainnet deposits, or spend funds without explicit approval.

## Product

Pelargo is a merchant-embeddable checkout concept built around NEAR Intents. A merchant defines the destination asset and recipient address. A buyer selects a supported source asset and pays through the checkout flow.

The product must become a working checkout integration, not a mock payment UI or an undocumented thin API wrapper. Prioritise accurate quote details, explicit payment instructions, expiry handling, status reconciliation and verifiable destination settlement.

## Current implementation

### Frontend

- React 19, TypeScript and Vite.
- Northwind Goods demo storefront, checkout widget and merchant-facing view.
- Token selection, quote, payment, status, receipt and developer review UI are present.
- The interface still contains mock data and simulated states, including quotes, deposit addresses, QR artwork, transaction hashes, progress and settlement history.
- The QR artwork is decorative and is not a valid encoding of a real deposit address.
- No payment has been executed through Pelargo.
- Do not present a simulated receipt or progress state as proof of payment.

### API scaffolding

Cloudflare Pages Functions have been added on this branch:

- `GET /api/tokens` — intended to proxy supported-token discovery.
- `POST /api/quote` — validates and forwards quote requests.
- `GET /api/status?depositAddress=...` — intended to proxy execution-status lookups.

Shared request handling is in `functions/_lib/intents.ts`. The API layer is scaffolding, not a complete or verified payment backend. The frontend is not yet connected to a verified end-to-end payment lifecycle.

### Hosting and current blocker

- Cloudflare Pages project: `pelargo`.
- Public site: https://pelargo.pages.dev
- The user confirmed the deployed site loads and displays the expected Pelargo interface.
- The deployment's exact commit has not yet been verified against the active branch head.
- Requesting `/api/tokens` currently returns:
  `{"error":"Unable to reach the NEAR Intents token service"}`
- The upstream URL `https://1click.chaindefuser.com/v0/tokens` returns a token list when opened directly in the user's browser. This does not establish that the Cloudflare Function runtime can reach the upstream service.
- Commit `79be410b9388d5d9821ace8223ae08a1ff926ebf` changed the shared fetch helper to follow redirects. The user retested `/api/tokens` and the same generic error remained. This change has not resolved the observed failure.
- The token route catches exceptions and returns a generic message, hiding the underlying exception. The cause is unknown; do not guess or make further blind fixes.

## Immediate engineering priority

Diagnose the deployed `/api/tokens` failure before connecting more UI or adding payment functionality.

1. Inspect the latest commit on `build/live-intents` and compare it with the commit used by the latest Cloudflare Pages deployment.
2. Inspect the Cloudflare Pages Function logs for the failing request.
3. Review `functions/api/tokens.ts` and `functions/_lib/intents.ts`.
4. Add safe, temporary diagnostics that identify the failure category and upstream HTTP status where available. Never log JWTs, authorization headers, secrets or sensitive payment data.
5. Reproduce the request and identify the actual cause before changing network, redirect, authentication or response-handling logic.
6. Retest the deployed endpoint and record the observed result. A successful browser request to the upstream URL is not a substitute for testing through the deployed Function.

Do not claim the API works until the deployed route has returned and parsed a valid upstream response.

## NEAR Intents and payment safety

The current 1Click flow is treated as mainnet. No testnet checkout path has been established for this implementation.

- `dry: true` requests a quote preview; it does not create a deposit address.
- `dry: false` creates a real mainnet deposit address and may lead to an irreversible transfer.
- `ALLOW_MAINNET_DEPOSITS` must remain unset.
- Do not request or create committed quotes, send funds, or run a real payment test without explicit project-owner approval and a reviewed small-value test plan.
- Do not invent merchant destination or refund addresses.
- If a partner JWT is required, store `ONECLICK_JWT` as a server-side Cloudflare secret. Never expose it through Vite client variables or browser code.
- A quote is not a payment. A deposit address is not proof of deposit. A pending status is not settlement.
- Never mark an order paid based only on a timer, quote creation, deposit detection or an unverified status.
- Only mark paid after a successful terminal status and verification of destination transaction details. `FAILED`, `REFUNDED` and `INCOMPLETE_DEPOSIT` must never be treated as paid.

## Intended payment lifecycle

1. Merchant creates an order with a destination asset and recipient.
2. Buyer opens the checkout widget.
3. Widget retrieves supported assets.
4. Buyer selects a source asset.
5. Backend requests a dry quote.
6. Buyer reviews the amount, fees, destination, expiry and payment conditions.
7. Only after explicit buyer confirmation and an approved operational configuration may the backend request a committed quote.
8. NEAR Intents returns a unique deposit address and any required memo.
9. Buyer sends the exact quoted amount.
10. Backend polls execution status through terminal state.
11. Pelargo verifies successful destination settlement and transaction details.
12. The order is marked paid only after that verification.

## Architecture and scope decisions

- Keep the existing UI and improve it incrementally; no redesign unless explicitly requested.
- Use Cloudflare Pages Functions for the API layer.
- Keep infrastructure free-first. No Supabase dependency.
- Do not add a database until persistent order binding is demonstrably required; consider Cloudflare D1 at that point.
- Keep the policy and order lifecycle distinct from the 1Click provider implementation where practical.
- First prove token discovery and dry quotes through the deployed API.
- Then connect the widget to real API responses and implement correct quote expiry and payment-state handling.
- Replace decorative QR artwork with a standards-compliant QR encoding only when a real deposit address and memo exist.
- Defer wallet connectors, SaaS onboarding, analytics, webhooks and additional providers until the core checkout lifecycle works.

## Development and handover rules

At the start of each new work session:

1. Read this file and the repository README.
2. Inspect the current repository state and active branch. Do not assume this handover is newer than GitHub.
3. Confirm the latest branch commit and relevant deployment state before diagnosing a deployment issue.
4. Distinguish implemented, deployed, tested and verified functionality. These are different states.
5. Make the smallest evidence-based change that resolves the current blocker.
6. Keep changes on `build/live-intents`; do not merge into `main` or deploy without explicit approval.
7. Update this file and the README after each material milestone.

Every milestone update should state:
- **Completed:** what changed.
- **Verified:** what was actually tested and observed.
- **Not verified:** what remains unproven.
- **Next action:** the single highest-priority task.

Do not invent test results, deployment status, API capabilities or payment outcomes. If blocked, state the exact blocker and the evidence needed to resolve it.

## Submission standard

The public repository, deployed demo and hackathon explanation must clearly distinguish prototype screens from live functionality. A judge must be able to tell exactly which parts are operational and what evidence supports each claim.

## Diagnostic change — 5 November 2026

- **Completed:** Commit `aa7580519a368d8faab0b88954f0332f3a4edaa2` adds sanitized server-side logging to `GET /api/tokens` when the upstream fetch throws. The log records only the error name and message; it does not log request headers, JWTs or payment data.
- **Completed:** The public 502 response now includes the stable code `UPSTREAM_FETCH_FAILED` and the Cloudflare `cf-ray` request identifier when available. The underlying exception message is not exposed publicly.
- **Verified:** The change was committed to `build/live-intents`. Source inspection confirms the diagnostic log is inside the fetch exception handler.
- **Not verified:** The change has not been deployed or exercised in the Cloudflare runtime. No root cause has been established. This diagnostic only covers thrown fetch failures; non-2xx upstream HTTP responses continue to be forwarded as-is.
- **Next action:** With explicit approval, deploy this branch, request `/api/tokens` once, and inspect the matching Cloudflare Function log using the returned `cf-ray` identifier.
