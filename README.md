# Pelargo

A merchant-embeddable checkout concept built around NEAR Intents. Buyers choose a supported source asset; merchants specify the asset and address they want to receive.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Implementation status

**The current storefront and checkout interface are a frontend prototype. They still contain mock quotes, addresses, QR artwork, transaction hashes, progress states and settlement history. They do not yet execute payments.**

The `build/live-intents` branch now contains an initial Cloudflare Pages Functions API layer for:
- `GET /api/tokens`: forward supported-token discovery to NEAR Intents 1Click.
- `POST /api/quote`: validate and forward quotes. Dry-run quotes are enabled; committed quotes are blocked unless `ALLOW_MAINNET_DEPOSITS=true` is deliberately configured.
- `GET /api/status?depositAddress=...`: forward execution-status lookups.

These endpoints are scaffolding, not a verified integration. A live API quote has not yet been tested from the deployed application. No payment has been executed.

**Important:** NEAR Intents 1Click is a mainnet service. A dry quote does not create a deposit address. A committed quote creates a real mainnet deposit address and can lead to an irreversible payment. There is no testnet checkout path in this implementation. Do not enable committed quotes or send funds without an explicitly approved, small-value test.

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the current build state and decisions.

## Run locally

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Stack

- React 19, TypeScript and Vite.
- Plain CSS design tokens.
- Cloudflare Pages Functions for the server-side API layer.
- NEAR Intents 1Click API for supported-token discovery, quotes and status.
- No Supabase or paid database is currently required. D1 will be added only if persistent order records are needed.

## Intended payment lifecycle

```text
Merchant order
     |
     v
Pelargo checkout widget
     |
     v
Pelargo API ---- GET /v0/tokens
     |           POST /v0/quote (dry preview)
     |           POST /v0/quote (commit after approval)
     v
Buyer sends the exact quoted asset amount to the unique deposit address
     |
     v
NEAR Intents solver network
     |
     v
GET /v0/status until a terminal state
     |
     +---- SUCCESS: verify destination transaction before marking paid
     +---- REFUNDED / FAILED / INCOMPLETE_DEPOSIT: do not mark paid
```

Pelargo coordinates the quote and payment status. It does not custody buyer funds. A quote is not proof of payment, and a pending status is not settlement.

## Demo interface

The Northwind Goods storefront and floating developer review panel are retained for UI evaluation. The panel can preview screens and error states, but those controls are mock/demo controls until each state is connected to the live API.

## License

MIT
