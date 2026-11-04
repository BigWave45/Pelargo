# Pelargo — Build Status

Last updated: 5 November 2026

## Active branch
`build/live-intents`

Default branch `main` is unchanged. Do not merge or deploy to production without explicit approval.

## Product target
A merchant-embeddable checkout that lets a buyer pay from a supported asset and lets the merchant receive a specified destination asset through NEAR Intents 1Click.

## Verified repository state
- React 19 + TypeScript + Vite frontend.
- Existing Northwind Goods storefront, checkout widget and merchant view.
- Quote amounts, deposit addresses, QR pattern, transaction hashes, payment progress and settlement history are mock data.
- The widget auto-advances to a successful receipt after six seconds without a blockchain payment.
- The QR graphic is a generated decorative pattern, not a valid QR encoding.
- `.env.example` contains only an unused `INTENTS_API_KEY` placeholder.
- Existing GitHub Actions workflow deploys the static frontend to GitHub Pages.

## Critical integration constraint
NEAR Intents 1Click is a mainnet service; no official testnet deployment has been verified. A `dry: true` quote is a price preview and does not create a deposit address. A `dry: false` quote creates a real deposit address and can lead to a real mainnet payment. Never request a wet quote or initiate a payment without the operator explicitly approving that test.

## Decisions
- Keep the existing UI and work incrementally; do not redesign it.
- Free-first infrastructure. No Supabase dependency.
- Keep API credentials server-side if/when supplied. Never expose JWTs in Vite client variables.
- First milestone: prove token discovery and a dry quote against the live 1Click API.
- Do not claim testnet, guaranteed rates, instant settlement, zero slippage, or payment success without evidence.
- No wallet connector, merchant SaaS dashboard, analytics, webhooks or additional providers in the first milestone.

## Next actions
1. Confirm current 1Click API request/response schema and supported asset IDs.
2. Implement a minimal Cloudflare Worker proxy for token discovery, dry quote, committed quote and status lookup, with strict route allowlisting and input validation.
3. Add D1 only if persistent order-to-quote binding is required for the first working demo.
4. Connect one supported route in the existing widget.
5. Test quote preview first. Request explicit approval before any real deposit/payment test.
6. Remove or clearly isolate all mock settlement paths before presenting the app as live.

## Submission standard
The README and demo must distinguish mock screens from live functionality. Only mark an order paid after 1Click reports terminal `SUCCESS` and the returned destination transaction details are available.
