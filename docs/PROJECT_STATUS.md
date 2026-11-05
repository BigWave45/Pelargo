# Pelargo — Build Status

Last updated: 5 November 2026

## Active branch and change control

- Active development branch: `build/live-intents`.
- Repository: `BigWave45/Pelargo`.
- Keep all development changes on `build/live-intents`.
- `main` is separate and must remain untouched unless the project owner explicitly authorises a merge.
- Do not deploy production changes, enable mainnet deposits or spend funds without explicit approval.

## Product

Pelargo is merchant checkout infrastructure built around NEAR Intents. A merchant defines the destination asset and recipient address. A buyer selects a supported source asset and pays through an embedded checkout.

The primary application is the merchant workspace. The buyer checkout is a separate, focused embedded experience. Developer integration is a supporting workspace area.

## Current frontend state — workspace restructuring

- **Completed:** Replaced the Northwind Goods storefront-first entry point with a merchant workspace.
- **Completed:** Added four navigation areas: Overview, Payment destination, Checkout and Developers.
- **Completed:** Removed fabricated settlement metrics, sample transaction history, fake live-gateway status and the floating developer review controls from the primary application.
- **Completed:** Added an empty payment activity state that explicitly requires verified settlement records.
- **Completed:** Added destination configuration fields and made clear that they are local-only drafts; backend persistence and merchant authentication do not exist.
- **Completed:** Added a buyer checkout design preview that cannot create a quote or initiate a payment.
- **Completed:** Added illustrative integration markup and clearly marked it as non-executable because no public SDK exists.
- **Design:** Warm paper workspace, restrained cobalt accent, consistent spacing, sidebar navigation and responsive layouts.

## API scaffolding and payment safety

Cloudflare Pages Functions are present:

- `GET /api/tokens` — proxy supported-token discovery.
- `POST /api/quote` — validates and forwards quote requests.
- `GET /api/status?depositAddress=...` — proxy execution-status lookups.

The frontend is not yet connected to a verified end-to-end payment lifecycle.

The previous live quote response was HTTP 400 and explicitly identified missing `depositType`, `refundType`, `recipientType` and an ISO 8601 `deadline`. The dry quote panel payload was updated to include those fields. The corrected payload has not yet been tested.

The user previously reported that the deployed `/api/tokens` route returned a generic upstream connectivity error. A direct browser request to the upstream token endpoint returned a token list, but that does not establish Cloudflare Function connectivity. No verified deployed API status should be inferred from that browser test.

### Mainnet safety

- NEAR Intents 1Click is treated as a mainnet service.
- `dry: true` requests a quote preview; it does not create a deposit address.
- `dry: false` creates a real mainnet deposit address and may lead to an irreversible transfer.
- `ALLOW_MAINNET_DEPOSITS` must remain unset.
- Do not create committed quotes, send funds or run a real payment test without explicit project-owner approval and a reviewed small-value test plan.
- Never request or handle private keys or seed phrases.
- Never mark an order paid based on a timer, quote creation, deposit detection or an unverified status.
- Only mark paid after a successful terminal status and verification of destination transaction details. `FAILED`, `REFUNDED` and `INCOMPLETE_DEPOSIT` must never be treated as paid.

## Hosting

- Cloudflare Pages project: `pelargo`.
- Public site: https://pelargo.pages.dev
- Exact deployment commit must be checked in Cloudflare Pages before treating a preview or production URL as current.
- No production deployment or merge to `main` is authorised by this change.

## Not implemented

- Merchant authentication and persistent merchant profiles.
- Persistent destination configuration.
- Order creation and order-to-quote binding.
- Public checkout SDK and executable embed script.
- Frontend connection to `/api/tokens`, `/api/quote` and `/api/status`.
- Committed quote approval controls and safe payment execution.
- Deposit address/memo rendering from a real committed quote.
- Standards-compliant QR generation for real deposit instructions.
- Status polling, terminal-state reconciliation and destination transaction verification.
- Webhooks, receipts and persistent verified settlement history.

## Next engineering priorities

1. Verify the corrected dry quote through the deployed Cloudflare preview.
2. Connect token discovery and dry quote requests to the buyer checkout only after the API behavior is confirmed.
3. Implement server-side order creation and bind each quote to a merchant order.
4. Add persistent merchant destination configuration only after the identity and validation model is defined.
5. Implement status reconciliation and destination transaction verification before showing paid status.
6. Publish the SDK/embed contract only after the checkout lifecycle is operational.

## Development handover rules

1. Read this file and the repository README at the start of a new session.
2. Inspect the current repository state and active branch; do not assume this document is newer than GitHub.
3. Distinguish implemented, deployed, tested and verified functionality.
4. Keep all changes on `build/live-intents`; do not merge to `main` or deploy production without explicit approval.
5. Update this file and README after each material milestone.
6. Never invent API results, deployment status, payment outcomes or test evidence.

## Submission standard

The public repository, deployed demo and project explanation must distinguish prototype screens from live functionality. No mock transaction, quote, receipt or settlement may be presented as evidence of a real payment.
