# Pelargo

Pelargo is merchant checkout infrastructure built around NEAR Intents. A merchant defines the destination asset and recipient address. A buyer chooses a supported source asset and pays through an embedded checkout.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Product direction

The primary application is a merchant workspace. It is organised around four tasks:

- **Overview:** setup progress, integration readiness and verified payment activity.
- **Payment destination:** merchant settlement asset, network and recipient address.
- **Checkout:** the buyer-facing flow intended to be embedded in a merchant's existing storefront.
- **Developers:** API and SDK integration guidance.

The Northwind Goods demo storefront is no longer the primary application entry point. The checkout preview is illustrative and does not create quotes or payments.

## Implementation status

**The current frontend is a prototype. It does not yet execute or verify payments.** The workspace deliberately shows no fabricated transaction volume, settlement history, successful payment states or live gateway indicators.

The `build/live-intents` branch contains an initial Cloudflare Pages Functions API layer:

- `GET /api/tokens`: proxy supported-token discovery to NEAR Intents 1Click.
- `POST /api/quote`: validate and forward quote requests. Dry-run quotes are intended to be used first; committed quotes remain blocked unless `ALLOW_MAINNET_DEPOSITS=true` is deliberately configured.
- `GET /api/status?depositAddress=...`: proxy execution-status lookups.

These endpoints are scaffolding, not a verified end-to-end integration. The dry quote payload was corrected after an upstream schema validation response, but the corrected request still needs to be tested.

**Important:** NEAR Intents 1Click is a mainnet service. A dry quote does not create a deposit address. A committed quote creates a real mainnet deposit address and can lead to an irreversible payment. There is no testnet checkout path in this implementation. Do not enable committed quotes or send funds without explicit approval and a reviewed small-value test.

## Frontend boundaries

- Merchant destination inputs are currently local UI state only; there is no persistence or merchant authentication.
- The checkout screen is a non-interactive preview. It does not request a quote.
- The developer snippet is illustrative markup, not a published or executable SDK.
- Payment activity remains empty until verified settlement records exist.
- The API status and readiness labels are conservative; they do not imply successful end-to-end processing.

## Run locally

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Stack

- React 19, TypeScript and Vite.
- Plain CSS design tokens and workspace styles.
- Cloudflare Pages Functions for the server-side API layer.
- NEAR Intents 1Click API for supported-token discovery, quotes and status.
- No Supabase or paid database is currently required. D1 should be considered only when persistent order records are needed.

## Intended payment lifecycle

```text
Merchant creates an order
        |
        v
Embedded Pelargo checkout
        |
        v
Buyer selects a supported source asset
        |
        v
Dry quote preview and explicit buyer review
        |
        v
Committed quote only after approved operational controls
        |
        v
Buyer sends the exact quoted amount to the unique deposit address
        |
        v
NEAR Intents solver network
        |
        v
Status reconciliation and destination transaction verification
        |
        v
Order marked paid only after verified successful settlement
```

A quote is not proof of payment. A deposit address is not proof of deposit. A pending status is not settlement. `FAILED`, `REFUNDED` and `INCOMPLETE_DEPOSIT` must never mark an order paid.

## Hosting and change control

- Cloudflare Pages project: `pelargo`.
- Public site: https://pelargo.pages.dev
- Active development branch: `build/live-intents`.
- Keep `main` untouched unless the project owner explicitly authorises a merge.
- Do not deploy production changes, enable mainnet deposits or spend funds without explicit approval.

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the current engineering handover.

## License

MIT
