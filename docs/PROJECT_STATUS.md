# Backend update — 5 November 2026

## NEAR NEP-141 verifier hardening

- Added a net-transfer calculation across successful token-contract receipt logs. Incoming `ft_transfer` events increase the merchant's received amount; outgoing events from the merchant, including resolver refunds, reduce it.
- This prevents a successful-looking initial transfer event from settling an order when `ft_transfer_call` later refunds part or all of the amount.
- Added migration `0008_settlement_evidence_contract_guard.sql`, requiring the stored NEAR asset ID to equal `nep141:` plus the verified token contract. The network comparison is normalized for case/whitespace.
- Extended the mocked API test to include a 1-unit refund after a 2,000,000-unit incoming transfer; the net 1,999,999 result must remain un-settled. An exact net 2,000,000 transfer then settles.

## NEAR NEP-141 settlement verifier — mocked CI verified

- Added `functions/_lib/near-settlement-verifier.ts`. For NEAR destination orders whose Intents asset ID is `nep141:<token-contract>`, it resolves the signer from FastNear's transaction indexer and verifies the transaction through NEAR RPC at `FINAL`.
- The verifier requires successful transaction execution, a successful receipt executed by the exact token contract, and a NEP-141 `ft_transfer` event matching the order's exact recipient and atomic amount.
- It checks the receipt block hash/height and ensures the block is no higher than the latest finalized block before creating evidence.
- `GET /api/payment-status` now invokes the verifier only after provider `SUCCESS`, while the lifecycle is `processing`, and a destination transaction hash is supplied.
- Settlement evidence insertion and the `processing -> settled` update occur in one D1 batch. Existing database triggers verify the evidence/order/candidate match and synchronize order status to `paid`.
- Non-NEAR destinations, non-NEP-141 asset IDs, missing candidate hashes, failed execution, missing/mismatched transfer events and unfinalized blocks do not settle.
- Added mocked integration tests for a wrong transfer amount (must remain processing) and an exact transfer match (must persist evidence and atomically settle the order).
- GitHub Actions run `41973414325`, commit `36348bf`, passed TypeScript, checkout-session security tests, checkout API integration tests and frontend build. This run includes refund-aware net amount checks, migration-0008 token-contract binding, automatic internal lifecycle progression when provider polling skips intermediate states, and a corrected signature-tampering test.


## Provider polling state-gap handling

- A merchant may poll infrequently and observe 1Click jump directly from a non-terminal state to `SUCCESS`, without observing `PROCESSING`.
- The status handler now advances the internal lifecycle through the allowed intermediate states (`awaiting_deposit`, `deposit_detected`, `processing`) before attempting destination verification. Each transition is compare-and-set and audited.
- The API integration test no longer manually sets the order to `processing`; it proves that a `SUCCESS` poll can fill the missing progression and still requires exact chain evidence before settlement.

## Multi-chain settlement expansion plan

Routing and settlement support are separate. NEAR Intents may quote source/destination assets on many chains, but Pelargo must not mark a merchant order paid until the configured destination chain has its own independent verifier.

- Current verified destination: NEAR mainnet NEP-141 only.
- Next: EVM ERC-20, using canonical RPC receipt/log verification, exact token contract, recipient and net amount, with chain-specific finality.
- Then: Solana SPL, using finalized transaction/meta and token balance/transfer evidence tied to the exact mint and recipient token account.
- Later: Bitcoin/UTXO networks, using transaction output/script matching, exact satoshi amount and a defined confirmation-depth policy. This is materially different from account-based token verification.
- Native coin transfers on NEAR/EVM/Solana require explicit separate handling; they must not be treated as token events.
- Every adapter requires mocked adversarial tests plus live read-only RPC/indexer validation before it can be enabled for checkout. A 1Click supported route alone is not sufficient evidence.

## Operational configuration and unverified scope

- Defaults: NEAR mainnet RPC `https://rpc.mainnet.near.org`; FastNear mainnet transaction indexer `https://tx.main.fastnear.com/v0/transactions`.
- Optional configuration: `NEAR_RPC_URL`, `NEAR_TX_INDEXER_URL`, and `NEAR_INDEXER_API_KEY`. FastNear is used to resolve the signer only; canonical NEAR RPC verifies transaction execution and finality.
- The integration tests mock all external HTTP responses. No live FastNear, NEAR RPC, 1Click or Cloudflare D1 call has been validated.
- NEAR mainnet NEP-141 is the only implemented settlement verifier. EVM, Solana, Bitcoin, NEAR native coin transfers and other token standards remain unsupported and fail closed.
- The current verifier uses the NEAR finality boundary, but production operational policy still needs RPC redundancy, rate-limit/backoff handling, reorg/incident reconciliation, indexer outage handling and an agreed confirmation policy.
- No deployment, merge to `main`, mainnet committed quote or real payment execution has been performed.

---

# Backend update — 5 November 2026

## Settlement guard CI verification

- GitHub Actions run `41972481094`, commit `20996a9`, passed all checks: TypeScript, checkout-session security tests, checkout API integration tests and frontend build.
- The API suite loads migrations `0001`–`0007`, verifies destination metadata persistence, and confirms a direct attempt to mark an order `settled` without matching immutable settlement evidence is rejected by the database.
- The generic lifecycle helper no longer allows `processing -> settled`.

## Settlement guard and destination metadata

- Added `destination_network` and `destination_symbol` to persisted checkout orders through migration `0006_order_destination_metadata.sql`; session creation now writes both fields.
- Added immutable `payment_settlement_evidence` records in migration `0005_verified_settlement.sql`, recording destination chain, asset, optional token contract, transaction hash, recipient, atomic amount, block number/hash, confirmations, verification source and timestamp.
- Added database triggers that reject a `settled` transition unless the lifecycle is already `processing` and evidence matches the persisted order network, asset ID, recipient, amount and candidate transaction hash.
- A successful settlement trigger also updates the order to `paid` atomically. Evidence rows cannot be updated or deleted.
- Removed `settled` from the generic `transitionPayment` transition map. Settlement must use a dedicated verifier path.
- Added API integration test coverage proving provider `SUCCESS` does not settle an order and the database rejects a direct settlement update without matching evidence.
- Migration `0007_match_settlement_network.sql` strengthens the evidence guard to require an exact destination-network match.

## Important scope boundary

This milestone is a **database safety gate**, not destination-chain verification. No chain RPC call, transaction receipt validation, token transfer-log decoding, confirmation-depth check or evidence-writing verifier has been implemented. Do not insert evidence based only on the provider's status response. The destination network is now persisted, but chain-specific token contract metadata still needs a trusted mapping from the Intents token catalogue.

Live Cloudflare D1 migration execution and live 1Click schema compatibility remain unverified. No deployment, merge to `main`, or real payment execution was performed.

---

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

---

# Infrastructure verification update — 5 November 2026

This section supersedes earlier infrastructure statements in this file where they conflict.

## Confirmed

- Active implementation baseline: `build/live-intents`, commit `1ec5ac0f2939cb0abdc51dfe9bd2984a62bb1950`.
- Cloudflare Pages project: `pelargo`; production branch: `build/live-intents`.
- D1 database: `pelargo-db`, ID `eae6ecc8-d79d-4d12-8a37-2d38ab84a0b1`.
- Production Pages configuration contains a `DB` binding to that D1 database.
- All eight migrations (`0001`–`0008`) are present in `d1_migrations` in order. Expected application tables, indexes and triggers were inspected.
- Manual foreign-key orphan checks returned zero for the six relevant relationships.
- A synthetic D1 lifecycle probe verified quote-commit state synchronization and audit event creation. A settlement transition without matching evidence was rejected by the database guard. Temporary probe records were removed; application tables were empty after cleanup.
- The latest observed successful production deployment is `e689d3ea` at commit `1ec5ac0`. It was created before the production D1 binding was configured, so it does **not** prove the deployed Functions can access D1.

## Not yet verified / release blockers

- Production Pages secret presence cannot be confirmed from the project configuration response. Configure encrypted production secrets `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET`; do not disclose their values in chat or commit them. Confirm the NEAR verifier's RPC/indexer configuration as appropriate. `ONECLICK_JWT` is only required if the current upstream integration requires partner authentication.
- Preview D1 binding is not confirmed.
- The Cloudflare D1 query interface rejected `PRAGMA integrity_check` with `SQLITE_AUTH`; full SQLite integrity check is outstanding. Manual relationship checks are not a substitute for that pragma.
- Production Functions have not yet been smoke-tested against the configured D1 binding.
- Live 1Click response compatibility, live FastNear/NEAR RPC verification and a real payment lifecycle remain untested. No real payment was made.
- `ALLOW_MAINNET_DEPOSITS` must remain unset. Do not create committed quotes or send funds.

## Controlled release plan

1. Confirm required encrypted production secrets are configured without exposing values.
2. Run the current branch CI and build/security/API tests.
3. Deploy the reviewed code to the approved production branch only after readiness checks pass.
4. Verify the resulting Cloudflare deployment commit and run non-payment API smoke tests against D1 using synthetic data.
5. Keep committed quotes disabled; separately review any later request to test a real payment.

## Change control

- Documentation/configuration corrections are being prepared on `ops/live-d1-readiness`, branched from the verified implementation commit. This branch is not the Pages production branch.
- `build/live-intents` remains the active production branch. `main` remains untouched.
- The project owner approved a controlled production deployment only after configuration and tests pass. That approval is conditional, not permission to bypass the release gates above.

## PR and preview deployment follow-up — 5 November 2026

- Draft PR #1 (`ops/live-d1-readiness` → `build/live-intents`) passed the GitHub Actions `verify` check.
- Cloudflare Pages also built and published a **preview deployment** for commit `23c6e612142454b0952bd124b9648817fd5d177e`: https://1af1cb9f.pelargo.pages.dev (branch alias: https://ops-live-d1-readiness.pelargo.pages.dev).
- This is a preview deployment only. It is not the production deployment and it does not prove runtime D1 access.
- A fresh Cloudflare Pages project read-back confirms there are currently **no configured secret variables** in either production or preview. Production has the `DB` binding; preview has no `DB` binding. Required production secrets `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET` are therefore still missing. Do not deploy application changes to production until these are configured.
- The preview build succeeding does not validate merchant provisioning, session issuance or payment routes because those require secrets and D1. Do not interpret the green Cloudflare build check as an API integration test.
- Next gate: configure the two encrypted production secrets and decide whether preview should receive its own isolated D1 binding and separate test secrets. Then run authenticated, synthetic-only API smoke tests. Keep mainnet commit disabled.



## Preview environment isolation — 5 November 2026

- Created a separate Cloudflare D1 database `pelargo-preview-db` (ID `0335acdc-f0e0-42f6-ba87-e3448fb91728`). It is not the production database.
- Applied migrations `0001` through `0008` to the preview database and verified the ordered migration history plus 18 schema objects (tables, indexes and triggers).
- Configured the Pages preview environment's `DB` binding to `pelargo-preview-db`.
- Generated separate preview-only `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET` encrypted secrets. They are not shared with production; values were not exposed.
- Production continues to bind `DB` to `pelargo-db` and retains its own two encrypted secrets.
- This is configuration and schema setup only. It does not itself publish a new preview deployment or prove deployed preview Functions can access D1. Runtime smoke tests remain next.

## Preview D1 lifecycle probe — 5 November 2026

- Latest preview deployment `02c2eb29` (commit `8cdf8d3`) completed successfully; GitHub Actions `verify` and Cloudflare Pages checks both passed for that commit.
- Direct synthetic SQL tests against `pelargo-preview-db` inserted a temporary merchant, order, session and lifecycle record.
- Updating the lifecycle to `quote_committed` synchronized the order to `quote_committed` and session to `committed`; the audit log recorded the initial and transition events.
- An attempted premature settlement from `quote_committed` was rejected by the database trigger. This probe verifies the state precondition, not the missing-evidence guard (the latter was separately verified against production D1 in the earlier probe).
- All synthetic rows were removed. Final preview table counts: merchants 0, orders 0, sessions 0, lifecycles 0, events 0, settlement evidence 0.
- Important limitation: these were direct D1 tests, not HTTP requests through deployed Pages Functions. Merchant provisioning, session signing/validation, order lookup and API-level D1 binding access remain unverified at runtime.



## Preview configuration and regression-test follow-up — 5 November 2026

- Commit `8968cfc735819c5c2b49a5dcd875f7613f0bec74` adds API route-handler regressions for missing session signing secret (503 fail-closed), stored expired sessions (410), revoked sessions (410), and inactive merchant credentials (401).
- GitHub Actions `verify` passed for this commit. Cloudflare Pages preview deployment `2d869dc1` also built successfully: https://2d869dc1.pelargo.pages.dev.
- These tests run against in-memory SQLite with mocked upstream responses. They do not exercise deployed Cloudflare Functions or live provider/chain services.
- Cloudflare Pages configuration read-back confirms encrypted-secret entries named `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET` in both environments. Secret values are redacted; their validity is not inferred from presence alone.
- Production Pages `DB` binding points to `pelargo-db`; preview `DB` binding has now been configured to the isolated `pelargo-preview-db`. The binding change happened after preview deployment `2d869dc1`; a fresh preview deployment is required before runtime testing.
- `main` remains untouched. No production deployment, committed quote or real payment was performed. Keep `ALLOW_MAINNET_DEPOSITS` unset.
- Next: publish a fresh preview build after the binding update, then run non-payment HTTP smoke tests using synthetic merchant data. Verify D1-backed merchant provisioning, checkout-session issuance/retrieval, order lookup and unauthenticated rejection. Do not expose API keys or session tokens in logs or chat.


## Preview redeployment after D1 binding update — 5 November 2026

- Cloudflare Pages deployed commit `955e64a1f6c1c2ad7c168de53ae7901a971b3f43` to preview URL https://d44c8697.pelargo.pages.dev.
- Cloudflare project read-back confirms preview environment `DB` now maps to `pelargo-preview-db` (ID `0335acdc-f0e0-42f6-ba87-e3448fb91728`). Production remains mapped to `pelargo-db`.
- GitHub Actions `verify` and the Cloudflare Pages check were still in progress at the time of this entry; do not record them as passed until their check runs complete.
- Attempting to open the deployed API URL through the available web reader was unsupported. No HTTP runtime result is claimed. Next test must use a direct HTTP-capable client or Cloudflare-supported runtime tooling with synthetic credentials, and must verify unauthenticated rejection plus authenticated D1-backed operations without logging secrets.


## Provider-status input hardening — 5 November 2026

- Updated `functions/api/payment-status.ts` to reject malformed provider `updatedAt` timestamps before writing provider state.
- Destination transaction-hash parsing now tolerates malformed/null array entries and only selects a non-empty bounded hash string.
- Added regression cases in `scripts/verify-checkout-api.mjs` for invalid timestamps and malformed transaction-hash entries.
- Code commits: `23ba7b5` (handler hardening), `593b9bd` (regression tests).
- CI and Cloudflare Pages checks for `593b9bd` were queued/in progress at the time of this note. Do not call the tests passed until GitHub reports success.
- Latest previous preview `3ec8313c` predates these changes. A new preview build is expected from the current branch push.
- This is provider-payload validation in the mocked API suite. It does not constitute live 1Click compatibility, live NEAR verification, or deployed D1 runtime validation.


## Settlement evidence concurrency hardening — 5 November 2026

- Added migration `0009_settlement_evidence_insert_guard.sql`. A settlement-evidence row can now be inserted only while the matching lifecycle is `processing` and its `destination_tx_candidate` equals the evidence transaction hash. This blocks stale verifier results from inserting evidence after the candidate changes.
- Extended `scripts/verify-checkout-api.mjs` to apply migration 0009 and assert that a mismatched candidate hash is rejected while the synthetic payment is processing. The fixture uses the actual order under settlement verification.
- Commits: `bd4a7ab` (migration), `08571e1` (regression case), `9271227` (correct fixture binding).
- Updated `wrangler.toml` comments to reflect the separate production and preview D1 bindings and the current migration requirement.
- Updated README to document migration 0009 and its deployment prerequisite.
- GitHub Actions and Cloudflare Pages checks for the documentation head were queued/in progress at the time of this update. Do not mark this commit green until both checks complete.
- Migration 0009 has not yet been applied to either remote D1 database. Apply it to preview after CI passes, then run the preview runtime smoke tests. Apply it to production only as part of the approved controlled release sequence.
- No production deployment, no main branch changes, no real payment execution. `ALLOW_MAINNET_DEPOSITS` remains unset.


## Preview D1 migration 0009 verification — 5 November 2026

- GitHub Actions `verify` and Cloudflare Pages checks completed successfully for commit `32379d452716ddc9b1b41db59c2443507288f147`.
- Applied `0009_settlement_evidence_insert_guard.sql` to preview D1 database `pelargo-preview-db` (ID `0335acdc-f0e0-42f6-ba87-e3448fb91728`). Migration history now records migrations 0001–0009; `sqlite_master` confirms the trigger exists.
- Ran a synthetic D1 integration probe: created a temporary merchant/order in `processing` with candidate hash `candidate-good`, attempted to insert settlement evidence with a different hash, and D1 rejected it with `SQLITE_CONSTRAINT_TRIGGER` and the expected message. This directly verifies the deployed database trigger behavior, independent of the in-memory SQLite test.
- Removed the synthetic order and merchant. Final probe counts: orders 0, merchants 0, evidence 0.
- This verifies preview D1 schema/trigger behavior. It does not verify HTTP Pages Function execution, real NEAR RPC/indexer behavior, or live 1Click quote compatibility.
- Production database has not received migration 0009. No production deployment or real payment. `main` remains untouched; `ALLOW_MAINNET_DEPOSITS` remains unset.
- Next: solve authenticated preview HTTP runtime testing, then validate quote/status against the actual 1Click response contract using provider test facilities or captured fixtures. Only after those pass proceed with the already-approved controlled production release.


## Provider-poll concurrency hardening — 5 November 2026

- `functions/api/payment-status.ts` now compare-and-sets provider poll results against the lifecycle status and destination transaction candidate observed before the upstream request. If another poll/verifier changes either while the request is in flight, the stale response returns HTTP 409 and cannot overwrite the newer provider state/candidate.
- Added a regression in `scripts/verify-checkout-api.mjs` that mutates the candidate during the mocked upstream request, then asserts HTTP 409 and confirms the newer candidate and prior provider state remain intact.
- Implementation commit: `d0c71f5`; concurrency regression commit: `685bacf`.
- CI for the concurrency regression has just been triggered; results are pending. Do not treat this change as verified until the workflow completes successfully.
- The preview D1 database has migration 0009 applied and the trigger's stale-candidate rejection was verified directly. The latest Pages preview is built from commit `cffaca9`; it predates the provider-poll compare-and-set change.
- Next: verify CI, deploy a fresh preview, and use a real HTTP client path to test unauthenticated rejection and D1-backed endpoint execution. Do not expose merchant keys or session tokens.
- No production deployment, no production migration 0009, no real payment. `main` untouched; `ALLOW_MAINNET_DEPOSITS` unset.


## Provider poll serialization refinement — 5 November 2026

- Extended the provider-poll compare-and-set snapshot to include `last_polled_at` in addition to lifecycle status and destination transaction candidate. This closes a same-status/same-candidate race where two concurrent polls could otherwise both pass the earlier guard.
- Added a regression case that changes only `last_polled_at` while a provider request is in flight and asserts the stale response receives HTTP 409 without overwriting provider state.
- Implementation commit: `7207241`; regression commit: `60d232e`.
- CI and preview deployment for the new commits are pending. Do not treat this refinement as verified until checks complete.
- Preview D1 remains on migration 0009. Production database and production deployment remain unchanged. No real payment execution; main branch untouched.


## Settlement batch rollback and retry test — 5 November 2026

- Reviewed the settlement sequence: verified chain evidence is inserted and lifecycle status changed to `settled` in a single D1 batch. Database triggers require matching evidence and atomically synchronize the order to `paid`.
- Added an integration regression that forces the lifecycle update in the batch to fail after the evidence insert is attempted. It asserts the endpoint does not report settlement, the evidence insert rolls back, lifecycle remains `processing`, and order remains unpaid. The test then removes the injected failure and retries the same provider success to verify a successful commit.
- Regression commit: `564e714`. CI and preview deployment are pending; do not mark passed until confirmed.
- This is an in-memory SQLite transaction test. Preview D1 has separately verified migration 0009's insert guard, but this batch rollback scenario has not yet been exercised against remote D1 or authenticated Pages HTTP.
- No production deployment, no real payment, `main` untouched.


## Settlement verifier failure-state reporting — 5 November 2026

- Fixed `payment-status.ts` so an exception after the lifecycle has advanced to `processing` returns the current persisted lifecycle state rather than the stale pre-verification state.
- Added an integration regression where provider status returns `SUCCESS`, the lifecycle advances, and the FastNear lookup fails. The response must be HTTP 503 and report `processing`; the database lifecycle must also remain `processing`.
- Implementation commit: `6c1a58a`; regression commit: `31b5a87`.
- CI and preview build for the regression are pending. This test uses mocked provider/indexer responses; no live NEAR verification.
- No production deployment or migration; no real payment; `main` untouched.


## Provider contract and public status hardening — 5 November 2026

- Committed quote persistence now requires a non-empty, bounded 1Click `correlationId` as well as the deposit address. If the provider response omits the identifier, Pelargo returns HTTP 502, leaves the order in `pending`, and keeps the checkout session consumed because the upstream commit outcome may already be real.
- Retired the unauthenticated legacy `GET /api/status` provider proxy with HTTP 410. The supported merchant interface is `GET /api/payment-status?orderId=...`, which requires merchant authentication and scopes lookup to that merchant.
- Added regression assertions for missing quote correlation IDs, retired public status access, FastNear Bearer authentication, and NEAR RPC `EXPERIMENTAL_tx_status` using `FINAL`.
- These are code-level tests using mocked provider/indexer/RPC responses. They do not establish live FastNear credentials, live NEAR RPC compatibility, or live 1Click behavior.
- Changes are grouped in one commit to conserve preview deployments. No production deployment, main-branch change, committed real quote, or payment execution.


## Persisted destination transaction candidate reuse — 5 November 2026

- Fixed a polling gap where 1Click could omit a destination transaction hash from a later `SUCCESS` response even though Pelargo had already persisted a valid candidate from an earlier poll.
- The status handler now uses the current response hash when supplied, otherwise the previously persisted candidate. The compare-and-set still protects against stale concurrent polls.
- Added a regression test where provider `SUCCESS` omits the hash, Pelargo reuses its stored candidate, and independent NEAR verification still runs. A transfer with a refund-adjusted amount mismatch remains unsettled.
- This is a mocked integration test; it does not establish live 1Click response consistency or live NEAR RPC/indexer availability.


## Scheduled expiry of abandoned, uncommitted checkouts

- Added a separate Cloudflare Worker entrypoint in `workers/expiry-sweeper.ts`, configured by `wrangler.expiry.toml` to run every five minutes against the production D1 binding when separately deployed.
- The sweep expires only orders that remain in lifecycle `pending`, whose order and active session expiry timestamps have elapsed. It does not expire `commit_attempted` sessions, committed quotes, deposits detected, or payments being processed.
- Added migration `0010_pending_expiry_sync.sql` to atomically synchronize a pending lifecycle expiry to the order and active checkout session. A failed dependent update aborts the lifecycle transition.
- Added integration coverage for the expiry sweep, synchronized order/session state, and idempotent repeated execution.
- The worker and migration are code/configuration only at this stage. Migration 0010 has not been applied to Cloudflare D1, the expiry Worker has not been deployed, and no cron has been activated. The five-minute schedule is proposed configuration, not an operationally active job.
- Committed quotes and uncertain `commit_attempted` outcomes are deliberately excluded; they need provider-aware reconciliation and must not be expired solely because the original checkout session TTL elapsed.


## Uncertain 1Click commit recovery queue

- Added migration `0011_payment_recovery_cases.sql` for durable, unique per-order recovery cases.
- The scheduled Worker now scans for `commit_attempted` sessions older than ten minutes whose lifecycle/order remain pending and which have no persisted quote ID or deposit address. It records an open operator case and is idempotent.
- Every 1Click quote request now overrides the client-supplied tracking value with the server-issued checkout session JTI in `sessionId`, giving the provider a stable reference for support investigation.
- Added operator-authenticated, read-only `GET /api/operator/recovery-cases`; it uses the existing provisioning secret and returns open cases without exposing merchant API keys or checkout tokens.
- No automatic retry, session reactivation, or expiry occurs for ambiguous commits. Current public 1Click documentation describes quote IDs and deposit-address status lookup but does not document lookup by `sessionId`; therefore a lost response cannot safely be reconstructed automatically using a documented API.
- Added mocked integration coverage for provider tracking IDs, stale-case creation, idempotency, operator authentication, and preserving the consumed commit session.
- Migration 0011 and Worker changes are code only until separately applied/deployed. No quote commit or payment was executed.

## Current engineering handover — 5 November 2026

This section is the current source of truth and supersedes older dated notes below where they conflict. Earlier entries are retained as historical records, not current deployment state.

### Repository and release boundaries
- Repository: `BigWave45/Pelargo`.
- Application integration branch: `build/live-intents`.
- Operational hardening branch: `ops/live-d1-readiness`, 48 commits ahead of `build/live-intents` at the latest comparison.
- PR #1 targets `build/live-intents`; it is not a PR to `main`. Do not merge to `main`.
- Cloudflare Pages project: `pelargo`; production branch setting: `build/live-intents`.
- No production deployment, real payment execution or mainnet deposit was performed as part of the current work. Keep `ALLOW_MAINNET_DEPOSITS` unset.

### Implemented backend capabilities
- Merchant provisioning is operator-authenticated; merchant API keys are returned once and stored as hashes.
- Merchant-authenticated checkout-session creation persists merchant-scoped orders and short-lived HMAC-signed sessions. Sessions bind amount, destination asset, recipient, merchant and order.
- Quote handling validates the signed session and persisted D1 session state. Dry quotes do not consume the session. A committed quote attempt consumes the session before the provider request and uses the server-issued session JTI as the provider `sessionId`.
- Committed quote persistence requires a non-empty bounded provider `correlationId` and valid deposit address. An ambiguous provider result leaves the session consumed to prevent duplicate deposits.
- Merchant-scoped order lookup and payment-status polling are implemented. Provider polling uses compare-and-set guards over lifecycle state, candidate transaction hash and poll timestamp to reject stale in-flight responses.
- Provider `SUCCESS` is only a candidate. NEAR mainnet NEP-141 settlement requires independent FastNear signer resolution and finalized NEAR RPC execution/receipt verification. Evidence must match network, token contract, recipient, net atomic amount and stored candidate hash before the order is synchronized to `paid`.
- Legacy unauthenticated `GET /api/status` is retired with HTTP 410. Use merchant-authenticated `GET /api/payment-status?orderId=...`.
- The generic lifecycle helper cannot set `settled`; the dedicated evidence-backed path is required.
- Only NEAR mainnet NEP-141 destination settlement is implemented. EVM, Solana, Bitcoin and other chain verifiers are roadmap work, not current capability.

### Expiry and uncertain quote recovery
- Migration `0010_pending_expiry_sync.sql` synchronizes expiry across pending lifecycle, order and active session. It intentionally excludes consumed/committed sessions.
- Migration `0011_payment_recovery_cases.sql` creates unique per-order recovery records.
- `workers/expiry-sweeper.ts` contains two scheduled tasks: expire abandoned uncommitted pending checkouts; and create an operator recovery case for `commit_attempted` sessions older than ten minutes when the order/lifecycle remain pending and no quote ID or deposit address was persisted.
- `GET /api/operator/recovery-cases` is read-only and requires `X-Pelargo-Provisioning-Key`. It uses the existing provisioning secret and does not return merchant API keys or session tokens.
- The Worker never retries, reactivates or expires ambiguous commits. The provider may have accepted a quote despite Pelargo losing the response.
- `wrangler.expiry.toml` targets production D1. New `wrangler.expiry.preview.toml` targets only `pelargo-preview-db`. Both define a five-minute cron; neither Worker is deployed and neither cron is active. Deploying either config activates its schedule.

### D1 and Cloudflare state
- The Pages preview `DB` binding is configured to the isolated preview D1 database; production remains bound to production D1. The existing preview deployment predates this binding update and must be refreshed before runtime testing.
- Production D1: `pelargo-db` (ID `eae6ecc8-d79d-4d12-8a37-2d38ab84a0b1`).
- Isolated preview D1: `pelargo-preview-db` (ID `0335acdc-f0e0-42f6-ba87-e3448fb91728`).
- Preview Pages `DB` binding targets the isolated preview database; production Pages `DB` binding targets production D1.
- Preview D1 migration history records `0001` through `0011`, including migrations 0010 and 0011 applied on 5 November 2026.
- Production D1 migration state is not established by the preview migration history and must be checked independently before a release.
- Direct synthetic preview-D1 tests passed for migration 0010 expiry synchronization and migration 0011 recovery-case insertion/idempotency. The tests used temporary synthetic merchant/order/session records, and cleanup confirmed zero remaining probe records.
- Pages preview HTTP runtime testing against D1 remains outstanding.

### Secrets and external dependencies
- Separate encrypted `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET` entries exist for preview and production; values are redacted by Cloudflare.
- `NEAR_INDEXER_API_KEY` is required by the verifier but has not been configured because no FastNear key has been supplied. Do not claim live NEAR settlement verification is operational.
- Defaults target NEAR mainnet RPC and FastNear transaction indexer. API tests mock both dependencies; endpoint and authentication compatibility need live validation.
- Do not expose secret values in logs, chat, source code or browser bundles.

### Test evidence and remaining validation
- `bun run test:security` and `bun run test:api` cover session signing/validation, merchant authentication, quote binding, replay protection, lifecycle transitions, stale poll rejection, provider status handling, recovery-case creation and settlement evidence rules using in-memory SQLite and mocked upstream responses.
- These tests do not prove deployed Pages Function behavior, live 1Click contract compatibility, FastNear credentials/response compatibility, NEAR RPC availability or real-chain settlement.
- Preview D1 has previously had direct synthetic tests for lifecycle synchronization and migration 0009's stale-candidate evidence guard. Those do not establish all 0010/0011 trigger/worker behaviours.
- Remaining release gates: obtain/configure a valid FastNear API key; verify provider/indexer/RPC contracts; refresh preview Pages deployment and run authenticated HTTP tests against isolated D1; validate both Wrangler Worker configs with the Wrangler CLI; deploy the preview Worker only after explicit operational readiness review, then observe its cron execution; review the full buyer checkout flow.
- Mainnet committed quotes, deposits and actual transfers remain disabled pending explicit release authorization.

### Documentation refresh
- README rewritten to describe current architecture, API endpoints, supported settlement scope, migration state and verification gaps.
- Merchant integration guide rewritten with current API contracts, trust boundaries, lifecycle behavior and unsupported capabilities.
- This handover section reconciles historical status entries below. Do not copy old deployment/migration claims forward without rechecking the live environment.
