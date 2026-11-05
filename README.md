# Pelargo

Pelargo is an embeddable crypto checkout and payment gateway built around NEAR Intents / 1Click. Merchants integrate a checkout button into an existing website or application. Buyers select an available source asset and network, review a quote, and pay using a compatible wallet. The merchant receives the configured destination asset when the route and destination are supported.

The checkout widget is the product. The merchant-facing workspace supports setup and integration; Pelargo is not a storefront builder.

## Capability boundaries

**Routing is not settlement verification.** NEAR Intents may route assets across multiple chains, but Pelargo only marks an order paid when its own destination-chain verifier confirms the exact transfer.

- Implemented settlement verifier: NEAR mainnet NEP-141 tokens.
- Verifier checks finalized NEAR transaction/receipt execution, the exact token contract, recipient and net atomic amount, including resolver refunds.
- EVM ERC-20, Solana SPL, Bitcoin and other destination verifiers are not implemented. Do not infer settlement support from 1Click routing availability.
- Source assets and networks are discovered from the provider; availability can change and is not guaranteed.

## Checkout flow

1. Merchant server provisions/uses a merchant API key and creates an order session.
2. Merchant server passes the short-lived signed session token and public order details to the browser widget.
3. Widget requests a dry quote for buyer review.
4. A committed quote can create real deposit instructions. It is a separate, potentially irreversible payment action.
5. Pelargo polls provider status and independently verifies the destination transaction before marking the order paid.
6. Merchant can query its order and payment status through authenticated server-to-server endpoints.

The current widget is an integration prototype. It is not a published SDK/CDN package, and it does not yet provide a complete production buyer payment experience. Do not use it to collect real customer funds.

## Backend implementation

Cloudflare Pages Functions and D1 provide the API and persistence layer.

| Area | Implemented |
|---|---|
| Merchant provisioning | Operator-authenticated merchant creation; API keys stored as hashes |
| Checkout sessions | Merchant-scoped order creation, short-lived HMAC-signed session tokens, replay protection |
| Quote orchestration | Session-bound dry quotes; committed quote persistence requires provider correlation ID and deposit details |
| Order access | Merchant-scoped order lookup |
| Provider status | Authenticated polling; stale concurrent responses rejected; provider SUCCESS is only a candidate |
| Settlement | Independent NEAR NEP-141 verification; immutable evidence and database guards; atomic paid-state synchronization |
| Expiry | Worker code for expiring abandoned, uncommitted pending sessions |
| Uncertain commits | Idempotent operator recovery cases for ambiguous upstream quote commits |

The generic lifecycle helper cannot mark an order settled. Settlement requires verified evidence matching the order's network, asset, recipient, amount and stored destination transaction candidate.

### API surface

- `POST /api/merchant` — operator-only merchant provisioning.
- `POST /api/checkout-session` — merchant-authenticated order/session creation.
- `GET /api/checkout-session?token=...` — validate/retrieve public session claims.
- `GET /api/tokens` — provider-supported asset discovery.
- `POST /api/quote` — session-bound dry or committed quote request.
- `GET /api/order?orderId=...` — merchant-scoped order lookup.
- `GET /api/payment-status?orderId=...` — merchant-scoped provider polling and eligible NEAR settlement verification.
- `GET /api/operator/recovery-cases` — operator-authenticated, read-only queue of ambiguous committed-quote outcomes.
- `GET /api/status` — retired; returns HTTP 410. Do not integrate with it.

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for request contracts and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the engineering and verification ledger.

## Database migrations

The repository contains migrations `0001` through `0011`.

- `0001`–`0008`: checkout storage, lifecycle, provider status, commit synchronization and settlement evidence constraints.
- `0009`: prevents stale/mismatched destination transaction evidence from being inserted.
- `0010`: synchronizes expiry across pending lifecycle, order and active session.
- `0011`: durable, unique recovery cases for uncertain upstream commits.

As of 5 November 2026, the isolated preview D1 database records migrations 0001–0011. This is not evidence that production D1 has those migrations. Production migration state must be checked separately before any release.

## Scheduled reconciliation worker

`workers/expiry-sweeper.ts` contains two scheduled jobs:

- Expire only pending orders whose order and active session expiry timestamps have elapsed.
- Create an operator recovery case for a `commit_attempted` session older than ten minutes when the order/lifecycle remain pending and no provider quote ID or deposit address was persisted.

Ambiguous commits are never automatically retried, reactivated or expired. The provider may have accepted the quote even if Pelargo lost its response. The operator queue uses the provisioning secret and returns no merchant API keys or checkout tokens.

`wrangler.expiry.toml` describes the production Worker and production D1 binding. `wrangler.expiry.preview.toml` is the separate preview configuration bound to `pelargo-preview-db`. Both define a five-minute cron, but neither Worker has been deployed and neither cron is active. Deploying either configuration activates its schedule.

## Verification status and limits

- API/security tests use an in-memory SQLite database and mocked upstream provider, FastNear and NEAR RPC responses. They validate application logic; they are not live provider or chain tests.
- Preview D1 has migration history 0001–0011. Migrations 0010 and 0011 were applied to preview on 5 November 2026.
- Direct synthetic preview-D1 tests passed for migration 0010 expiry synchronization and migration 0011 recovery-case insertion/idempotency. All synthetic records were removed; cleanup returned zero remaining probe records.
- The Pages preview `DB` binding targets the isolated preview database. Preview deployments have been re-enabled only for `ops/live-d1-readiness`; the next eligible push is intended to create the single refreshed preview needed for runtime verification.
- Live 1Click response compatibility, FastNear authentication/response compatibility and live NEAR RPC verification remain outstanding.
- `NEAR_INDEXER_API_KEY` is required by the verifier. It has not been configured in Cloudflare because no key has been supplied.
- Merchant webhooks, self-serve onboarding, credential rotation, production rate limiting and non-NEAR settlement verifiers are not implemented.

## Safety and release controls

- Keep `ALLOW_MAINNET_DEPOSITS` unset. Mainnet deposits and committed quotes remain disabled.
- Do not initiate a real payment or transfer funds without explicit approval.
- Never expose merchant API keys, `MERCHANT_PROVISIONING_SECRET`, `ORDER_SESSION_SECRET` or indexer credentials in browser code or public repositories.
- A quote, deposit address, detected deposit or provider SUCCESS is not proof of merchant settlement.
- `FAILED`, `REFUNDED` and `INCOMPLETE_DEPOSIT` must never mark an order paid.
- Do not merge to `main` or deploy production without explicit release authorization.

## Hosting and development

- Cloudflare Pages project: `pelargo`.
- Public project hostname: https://pelargo.pages.dev
- Application integration branch: `build/live-intents`.
- Current operational hardening branch: `ops/live-d1-readiness`.
- `main` remains separate and must not be changed without authorization.

Stack: React, TypeScript, Vite, Cloudflare Pages Functions, Cloudflare D1 and NEAR Intents / 1Click.

Run locally:

```bash
bun install
bun run dev
bun run test:security
bun run test:api
bun run build
```

See [docs/INTEGRATION.md](docs/INTEGRATION.md) before implementing a merchant integration.

## License

MIT
