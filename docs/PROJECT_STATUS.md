# Pelargo — Build Status

Last updated: 5 November 2026

## Active branch
`build/live-intents`

Default branch `main` is unchanged. Do not merge or deploy to production without explicit approval.

## Verified starting state
- React 19 + TypeScript + Vite frontend.
- Northwind Goods storefront, checkout widget and merchant view exist.
- Quotes, deposit addresses, QR artwork, transaction hashes, progress and settlement history are mock data.
- The widget previously auto-advanced to a successful receipt without a blockchain payment.
- The QR graphic is decorative, not a valid QR encoding.
- The existing GitHub Pages workflow deploys only from `main`.

## Changes committed to this branch
- Added Cloudflare Pages Functions routes:
  - `GET /api/tokens`
  - `POST /api/quote`
  - `GET /api/status?depositAddress=...`
- Added a shared server-side 1Click request helper.
- Committed quotes (`dry: false`) are blocked unless `ALLOW_MAINNET_DEPOSITS=true` is deliberately configured.
- Added `wrangler.toml` for Cloudflare Pages configuration.
- Rewrote README to distinguish prototype UI from live integration.
- Added CI workflow for TypeScript checking and frontend build.

These are scaffolding changes. They have not yet been deployed or verified against the live API. The frontend is not yet connected to these routes.

## Critical network constraint
NEAR Intents 1Click is a mainnet service; no official testnet deployment is available in the documented flow. A `dry: true` quote is a price preview and does not create a deposit address. A `dry: false` quote creates a real mainnet deposit address. Do not enable committed quotes or initiate payment without explicit operator approval.

## Decisions
- Keep the existing UI and work incrementally; no redesign.
- Free-first infrastructure; no Supabase dependency.
- Use Cloudflare Pages Functions for the API. No database until persistent order binding is demonstrably needed.
- Keep any partner JWT in a Cloudflare secret, never in Vite client variables.
- Start with token discovery and dry quote only.
- Do not claim testnet, guaranteed rates, instant settlement, zero slippage or payment success without evidence.
- No wallet connector, SaaS dashboard, analytics, webhooks or extra providers in the first milestone.

## Next actions
1. Confirm CI passes on this branch.
2. Verify the 1Click token list and dry-quote schema against the live service.
3. Configure a free Cloudflare Pages project and deploy this branch's frontend + Functions.
4. Connect the widget to live token discovery and dry quotes.
5. Replace decorative QR artwork with a standards-compliant QR encoding when a real deposit address exists.
6. Add committed quote support only after an explicitly approved mainnet test plan, valid merchant destination address and refund address are available.
7. Poll status to terminal state; mark paid only after `SUCCESS` and verify destination transaction details.

## Submission standard
The README and demo must distinguish mock screens from live functionality. Never mark an order paid merely because a timer elapsed or a quote was created.
