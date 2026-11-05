# Backend update — 5 November 2026

## Verified CI, provider status and committed-quote persistence milestone

- GitHub Actions run `41949603160`, commit `3bba71b`, passed TypeScript type-check, checkout-session security tests, checkout API integration tests and frontend build.
- Fixed the duplicate fetch declaration and the incorrect status URL assertion in the API test harness.
- Added `migrations/0004_commit_state_sync.sql`. A lifecycle transition to `quote_committed` now synchronizes the matching order and commit-attempted session inside the same SQLite statement. A missing/stale dependent row aborts the entire transition.
- Changed `POST /api/quote` to use one compare-and-set lifecycle update rather than three loosely coordinated batch updates. It requires exactly one lifecycle row to change.
- Added mocked committed-quote integration coverage: provider correlation ID, deposit address and memo are persisted; lifecycle/order/session states are synchronized; an invalid dependent session causes the transition to roll back.
- The test temporarily enables the commit flag only in its isolated test environment and replaces upstream fetch with a mock. No live quote is created and no funds are moved.
- Provider-status tests cover merchant authentication, deposit-memo forwarding, status persistence and the guard preventing provider `SUCCESS` from independently settling an order.
- These tests use in-memory SQLite with repository migrations and mocked upstream responses. They do not prove live Cloudflare D1 behavior or live 1Click schema compatibility.

## Remaining payment lifecycle gaps

- The committed-quote path is now covered with mocked route-handler tests, but live 1Click committed quote behavior remains unverified. Mainnet commits remain disabled in the deployed configuration; no real deposit instructions have been requested.
- Provider status is not independent settlement proof. Destination-chain transaction verification is not implemented. A candidate transaction hash must be independently checked against the destination chain, recipient, asset, amount and finality requirements before settlement.
- Live D1 migration execution/bindings, live 1Click status and quote schemas, polling reliability, webhook delivery and scheduled reconciliation remain unverified or unimplemented.
- No deployment, merge to `main`, or real payment execution has been performed.
---

# Backend update — 5 November 2026

## Committed quote persistence and status polling

- `POST /api/quote` now reads the 1Click committed-quote response using its documented structure: `correlationId` at the top level and `quote.depositAddress` / optional `quote.depositMemo`.
- A successful committed quote attempts to persist the quote ID, deposit address, memo, lifecycle status and checkout-session status in D1.
- Added `migrations/0003_provider_status.sql` for provider status, provider update time, destination transaction candidate and polling timestamp.
- Added merchant-authenticated `GET /api/payment-status?orderId=...`. It resolves the order within the authenticated merchant, polls 1Click using the persisted deposit address and memo, stores the provider status and advances only allowed non-settlement lifecycle transitions.
- Provider `SUCCESS` is deliberately not mapped to Pelargo `settled`. Its destination transaction hash is retained as a candidate pending independent chain verification.
- API tests now cover authenticated status polling, memo forwarding, provider status persistence and the guard against marking an order settled from provider `SUCCESS` alone.

## Important limitations

- The new quote persistence and status polling changes have not yet passed CI. Do not treat them as production-ready.
- The 1Click provider status is authenticated upstream evidence, not independent destination-chain finality.
- The older public `GET /api/status?depositAddress=...` endpoint remains a legacy upstream proxy and is not the merchant order status interface.
- Live Cloudflare D1 migration execution and live 1Click quote/status integration remain unverified.
- No deployment, main-branch merge or real payment execution has been performed.

# Current engineering update — 5 November 2026

## Verified backend milestone

- GitHub Actions run for commit `1eb7198` passed: TypeScript type-check, checkout-session security tests, checkout API integration tests and frontend build.
- API integration tests run against an in-memory SQLite adapter with the actual migration and route handlers. This is local integration coverage, not a live Cloudflare D1 preview test.
- Added `GET /api/order?orderId=...`. It requires `X-Pelargo-Merchant-Key`, resolves the active merchant by API-key hash and scopes the order query by merchant ID.
- Added tests for unauthenticated access, own-order retrieval, cross-merchant isolation, missing order ID, returned order fields and token non-disclosure.
- The first test run exposed a test defect: the missing-order-ID case omitted merchant authentication, so the endpoint correctly returned 401 before validating the query. The test was corrected to authenticate, and the subsequent CI run passed.
- All work remains on `build/live-intents`. No production deployment, merge to `main`, or committed payment execution was performed.

## Current limitations

- Cloudflare D1 preview binding and migration have not been verified from this environment.
- The order endpoint currently returns the stored order status; it does not establish settlement.
- The existing `/api/status` endpoint is still an upstream status proxy and is not merchant-scoped. It must not be treated as the merchant's verified order status API.
- The payment state machine, deposit-address/reference persistence, settlement reconciliation and merchant webhooks remain unimplemented.
- Mainnet committed quotes must remain disabled.

## Next engineering milestone

Define and implement the durable order/payment state model and event history before enabling any real execution. State transitions must be server-controlled, monotonic where appropriate, idempotent and driven by verified NEAR Intents status plus destination transaction evidence. Add tests for invalid transitions, duplicate events, amount/asset/recipient mismatches, timeout and terminal states.

---

# Pelargo — Build Status

Last updated: 5 November 2026

## Active branch and change control

- Repository: `BigWave45/Pelargo`.
- Active development branch: `build/live-intents`.
- Keep all development changes on this branch.
- `main` must remain untouched unless the project owner explicitly authorises a merge.
- Do not deploy production changes, enable committed mainnet quotes or spend funds without explicit approval.

## Product definition

Pelargo is a **universal checkout widget powered by NEAR Intents**. Category: **Web3 payments infrastructure / cross-chain crypto checkout / payment gateway**.

Any merchant or application should be able to add a checkout button to an existing website or app. The buyer opens Pelargo, selects a supported source token and blockchain, and pays from a compatible wallet they already use. NEAR Intents routes the payment to the merchant's configured destination asset and address.

The widget is the product. Merchant setup and developer documentation are supporting surfaces only. Do not turn Pelargo into a storefront builder or broad merchant SaaS dashboard.

“Any wallet and blockchain” is an ambition, not a compatibility guarantee. The widget must display only source assets/networks supported by the current Intents service and usable through the payment instructions provided.

## NEAR Hackathon track fit

- **Primary:** Track 08 / Real-World Money (RWM). The official track explicitly calls for merchant payments and stablecoin rails for real businesses, including NEAR Intents.
- **Secondary candidate:** Track 13 / Open Innovation (NEW), if the submission demonstrates a genuinely reusable cross-chain checkout primitive for arbitrary existing apps.
- **Not a current fit:** Track 06 / AI Security & Defense and Track 07 / Agent Economy. Pelargo does not currently implement AI-agent spending controls or autonomous agent commerce.

Official track source: https://nearhackathon.com/

## MVP acceptance criteria

1. Merchant can integrate a checkout button/widget into an existing application without adopting a Pelargo storefront.
2. Merchant/order context supplies an amount, order reference, destination asset and receiving address. These values must not be hardcoded demo data.
3. Widget dynamically loads supported source assets and networks from the backend.
4. Buyer selects a supported source asset and receives a live dry quote.
5. Quote review clearly displays source amount, expected destination amount, fees, expiry and relevant payment details.
6. No committed quote or deposit instructions are created before explicit buyer confirmation.
7. After confirmation, the backend obtains real payment instructions and the widget renders the actual address, memo and a standards-compliant QR code where applicable.
8. Backend reconciles status and verifies destination settlement before marking an order paid.
9. Merchant application receives a trustworthy payment result; webhook delivery can follow the initial browser/server integration.
10. No mock state is presented as live payment evidence.

## Current implementation state

### Frontend

- The merchant workspace remains provisional. Reduce it to the minimum setup/integration surface needed by the widget.
- **Added:** `src/components/TokenDiscovery.tsx` provides a reusable live token catalogue with search and network filtering. The buyer checkout component separately loads the same API for its payment selector.
- **Added:** `src/components/PelargoCheckout.tsx` is a reusable buyer-facing checkout component. It loads live token records, selects a source asset, accepts a source-network refund address, converts destination amount using token decimals, and requests an `EXACT_OUTPUT` dry quote.
- **Connected:** The Checkout workspace renders the reusable component using the current local merchant destination settings. The order reference is a local preview placeholder, not a persisted merchant order.
- **Dry-run only:** The component does not request a committed quote, connect a wallet, create deposit instructions, initiate a transfer or mark an order paid.
- **Hardening:** The quote endpoint now validates required route types and a future ISO 8601 deadline at the server boundary. The deadline validator uses a strict timestamp pattern. No unsupported enum values are assumed.
- **Hardening:** In-flight quote responses are discarded if the buyer changes amount, source asset, refund address or merchant destination while the request is pending. A stale quote is cleared on relevant configuration changes.
- **Not verified:** The new component and quote request have not been tested against a current Cloudflare deployment; the corrected upstream schema and response mapping remain unverified.
- Existing legacy demo components/data still contain mock token choices, quote calculations, deposit addresses, QR artwork, transaction hashes, receipts and settlement history. Do not use them as live payment data.
- The illustrative embed snippet is not a published or executable SDK.

### Cloudflare Pages Functions

- `GET /api/tokens`: proxies supported-token discovery to NEAR Intents 1Click.
- `POST /api/quote`: validates and forwards quote requests.
- `GET /api/status?depositAddress=...`: proxies status lookups.

The earlier quote request reached the upstream service but failed schema validation because `depositType`, `refundType`, `recipientType` and ISO 8601 `deadline` were missing. The payload was updated with those fields, but the corrected dry quote has not yet been verified. Treat endpoint scaffolding as implemented, not proven operational.

The token UI expects the documented token array fields `assetId`, `decimals`, `blockchain` and `symbol`. It accepts either a raw array or an object with a `tokens` array. It does not construct asset IDs manually.

## Durable merchant identity and checkout storage milestone

- **Added:** `migrations/0001_checkout_storage.sql` creates `merchants`, `checkout_orders` and `checkout_sessions`, with unique merchant order IDs, session IDs and token hashes.
- **Added:** `functions/api/merchant.ts` provisions merchant records behind a separate operator-only `MERCHANT_PROVISIONING_SECRET`. It generates a high-entropy merchant API key and returns it once; only its SHA-256 hash is stored.
- **Changed:** `POST /api/checkout-session` authenticates a per-merchant API key against D1. Merchant identity/name are loaded from the database; callers can no longer choose arbitrary merchant IDs.
- **Changed:** order and session creation are persisted in a D1 batch. Duplicate merchant order references are rejected.
- **Changed:** `POST /api/quote` requires a valid signature plus an active matching D1 session record.
- **Replay protection:** a committed quote attempt atomically transitions the session from `active` to `commit_attempted` before the upstream call. Replays are rejected. Successful upstream commits transition to `committed` and update the order status.
- **Failure policy:** if an upstream commit outcome is uncertain, the session remains consumed. Operator review is required; do not retry blindly.
- **Required infrastructure:** create a Cloudflare D1 database, bind it as `DB` to the Pages Functions environment, apply `migrations/0001_checkout_storage.sql`, and configure `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET` as preview secrets.
- **Not yet implemented:** self-serve merchant signup, merchant key rotation/revocation endpoint, rate limiting, webhook delivery and settlement verification.
- **Added tests:** `scripts/verify-checkout-session.ts` checks valid HMAC sessions, token tampering, expiry, wrong signing secrets and missing secrets. CI now runs `bun run test:security` alongside type-check and build.
- **CORS:** JSON API responses now include cross-origin headers for merchant-hosted embeds; quote preflight explicitly allows the embed origin pattern.
- **Validation ordering:** committed-quote request fields are validated before the session is atomically consumed, preventing malformed requests from needlessly burning an order session.
- **Not verified:** no D1 database has been provisioned or bound, no migration has been applied, and CI/build results for this latest code have not yet been confirmed. Cryptographic unit checks do not prove D1 transaction behavior or the complete payment lifecycle.

## Signed checkout session milestone

- **Added:** `functions/_lib/checkout-session.ts` signs and verifies bounded-lifetime HMAC-SHA256 session tokens using Cloudflare Web Crypto.
- **Added:** `POST /api/checkout-session` issues a signed order token after verifying a per-merchant API key against D1; `GET` verifies the token and its active stored record.
- **Added:** `POST /api/quote` requires a valid signed session plus matching D1 record and binds exact-output amount, destination asset and recipient. Buyer-selected source asset and refund address remain variable.
- **Added:** the React widget and custom element require a signed `sessionToken` / `session-token` before requesting a quote.
- **Required secrets:** `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET`, configured as Cloudflare Pages secrets only. Per-merchant API keys are returned once by provisioning and stored only as SHA-256 hashes.
- **Superseded:** the initial shared gateway key model and signed-token-only verification have been replaced by D1-backed per-merchant credentials and active-session checks.
- **Deployment dependency:** until D1 is bound and migrated, checkout session issuance and quote verification return a storage-not-configured error. Keep committed quotes disabled.
- **Not verified:** no TypeScript/build run or Cloudflare preview test has been completed for these endpoints.

## Embeddable element milestone

- **Added:** `src/embed.tsx` registers a `<pelargo-checkout>` custom element and mounts the React checkout inside Shadow DOM.
- **Added:** `vite.embed.config.ts` builds a standalone ES module and stylesheet. The normal build script now runs the site build and embed build.
- **Added:** widget props support merchant-fixed amount, exact destination asset ID and an API base URL derived from the embed script origin.
- **Added:** public API responses include CORS headers and `POST /api/quote` handles OPTIONS preflight, allowing cross-origin browser requests from merchant sites.
- **Updated:** Developers view shows the proposed custom-element integration contract.
- **Not verified:** no build has been run and no Cloudflare preview has been confirmed to contain the embed assets. The element is not yet proven to load on a third-party merchant domain.
- **Security boundary:** embed attributes are public and untrusted. Quote authority comes from a signed session and matching D1 record created by the merchant server. Settlement verification and merchant callbacks are still absent. Never treat a browser success state as proof of payment.

## Payment lifecycle

```text
Merchant application creates order
  -> embeds/invokes Pelargo checkout with order context
  -> widget loads supported source assets
  -> buyer selects asset/network
  -> backend requests dry quote
  -> buyer reviews and explicitly confirms
  -> backend requests committed quote
  -> widget displays real deposit instructions
  -> buyer pays from compatible wallet
  -> backend reconciles Intents status
  -> backend verifies destination transaction
  -> merchant receives verified paid result
```

A quote is not payment. A deposit address is not payment. Detecting a deposit is not successful settlement. `FAILED`, `REFUNDED` and `INCOMPLETE_DEPOSIT` must never mark an order paid.

## Mainnet safety

- NEAR Intents 1Click is treated as a mainnet service in this implementation.
- `dry: true` requests a quote preview and does not create a deposit address.
- `dry: false` creates real payment instructions and can lead to irreversible transfers.
- Keep `ALLOW_MAINNET_DEPOSITS` unset.
- Do not create committed quotes or send funds without explicit project-owner approval and a reviewed small-value test plan.
- Never request or handle private keys or seed phrases.
- Never infer payment success from frontend timers or simulated states.

## Out of scope for MVP

- Storefront builder or sample ecommerce catalog as the main experience.
- Large merchant dashboard, analytics suite or fabricated transaction ledger.
- Billing, teams, roles and elaborate merchant account administration.
- Multiple payment providers before the Intents flow works.
- Mainnet payment testing without explicit approval.

## Next engineering sequence

1. Run build and TypeScript checks; fix any errors in the app and standalone embed bundles.
2. Verify token discovery and dry quote through a Cloudflare preview, inspecting actual upstream response fields.
3. Verify the custom element loads from a separate origin and that its stylesheet/API requests resolve correctly.
4. Implement merchant authentication and a signed, expiring order-session creation API. Bind amount, destination asset, recipient and merchant identity on the server; never trust embed attributes for committed payment authority.
5. Add persistent single-use quote/commit state and replay protection before enabling any committed quote.
6. Only after explicit project-owner approval, perform a controlled small-value payment test and render real deposit address/memo instructions.
7. Implement status reconciliation, destination transaction verification and merchant payment-result delivery.

## Verification record

- Latest implementation: per-merchant API-key lookup, D1 merchant/order/session schema, persistent session-token hash verification and atomic single-use commit-attempt state added. D1 binding/migration, secrets, build and preview tests are not configured or verified.
- CI/workflow runs for the latest code commit: none reported by GitHub at time of update.
- Build/lint: not run in this environment.
- Deployment: not verified. Do not assume Cloudflare Pages has deployed this branch head.
- Production deployment and merge to `main`: not authorised.

## Hosting

- Cloudflare Pages project: `pelargo`.
- Public site: https://pelargo.pages.dev
- Check the exact deployed commit in Cloudflare Pages before treating any URL as current.
- No production deployment or merge to `main` is authorised by this status update.

## Handover rules

1. Read this file and `README.md` before continuing.
2. Inspect the active branch and current files; this document may lag repository state.
3. Distinguish implemented, deployed, tested and verified behavior.
4. Keep changes on `build/live-intents`; do not merge to `main` or deploy production without explicit approval.
5. Update this file and README after each material milestone.
6. Never invent API results, deployment status or payment outcomes.
