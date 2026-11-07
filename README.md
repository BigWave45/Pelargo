# Pelargo

## Current product and design direction — 7 November 2026

- **Hackathon priority:** continue the blue-and-white UI, UX and copy redesign while validating a wallet-first buyer checkout. Wallet work extends the existing checkout; it does not replace the merchant API, checkout sessions, provider quote flow, order lifecycle or independent settlement verification.
- **Product vision:** a universal checkout layer powered by NEAR Intents. A merchant integrates Pelargo once; a buyer should be able to pay using a wallet, network and supported asset they already have; the merchant receives the configured settlement asset. Long-term universal coverage is a vision, not a claim about current compatibility.
- **Hackathon implementation target:** start with Base wallet connection, connected-address/network detection and supported-token balance discovery. Then verify whether the current Tidepool/1Click route can be executed directly from the connected wallet. Only implement direct signing and broadcast after confirming the provider's exact transaction/deposit requirements.
- **Current buyer flow remains implemented:** asset selection, dry quote, explicit confirmation, provider deposit instructions, manual source transfer and order/settlement tracking. Do not describe direct wallet payment as implemented until it passes an end-to-end test.
- **Fallback:** preserve the current deposit-address/manual-transfer path while wallet execution is being built and tested. Do not break the working quote, deposit, polling or settlement-verification path.
- **Design system and experience:** blue and white foundation; modern financial infrastructure combined with editorial minimalism; clear hierarchy, confident typography, generous spacing and product-led evidence. The buyer checkout, merchant workspace and developer integration each have distinct jobs and copy. Avoid generic fintech templates, decorative AI-generated 3D art, floating coins, glowing orbs and illustrations that do not explain a product operation. Prefer precise interface states and simple diagrams grounded in the actual payment flow.
- **Messaging:** simplicity is the primary emotional promise. Public positioning may communicate the universal checkout vision, but feature claims must distinguish implemented functionality from planned capability. Developers and merchants are both primary audiences.
- **Execution order:** (1) map the revised buyer journey and screen states, (2) validate Base wallet/provider transaction compatibility early, (3) integrate the confirmed wallet path into checkout, (4) complete the UI and copy redesign across public site/workspace/developer surfaces, (5) test mobile layouts and the complete demo, (6) update docs and submission evidence.
- **Release controls:** keep work on the existing redesign/integration branches and reviewable PRs. Do not merge, deploy Production, enable mainnet, or initiate a payment without explicit approval.
> **Current project handover — 7 November 2026.** This section supersedes older status statements elsewhere in this README.
>
> - **Product:** Pelargo is an embeddable, non-custodial crypto checkout for merchant websites and applications. The checkout widget is the product; the merchant workspace configures and integrates it. There is no Northwind Goods storefront in the current scope.
> - **Repository:** `BigWave45/Pelargo`. Active implementation branch: `reliability/background-reconciliation`. Draft PR #4 now targets `main` and remains unmerged. The workflow reconciliation commit `5c9d3fc` passed CI runs #477 and #478; merchant integration and embed runtime fixes through `3acdaa9` passed CI runs #487–#490. `main` remains unchanged pending review and acceptance.
> - **Branch map:** `build/live-intents` is the earlier checkout/API baseline; `ops/live-d1-readiness` adds merchant accounts, source-deposit verification and Preview readiness; `ops/near-rpc-signer-reconciliation` and `ops/settlement-reconciliation-system-fix` are intermediate recovery branches; `reliability/near-verifier-diagnostics` adds candidate-specific diagnostics; `reliability/background-reconciliation` contains the latest reconciliation, Preview password recovery and settlement-integrity work. `main` is an older demo-store snapshot, not the current application.
> - **Merchant order history (7 November dashboard observation):** six records are visible: one `settled`, three `awaiting_deposit`, and two `expired`. The one settled record is consistent with the immutable Preview D1 `chain_rpc` evidence for `ORDER-83587591`, transaction `vif8EKtCAzHcaihLNuC6XaRMhCzEDxUiHbAJJRQVUVE`, recipient `agentg.testnet`, amount `1000000` atomic units, block `276344867`. The three awaiting-deposit records are unpaid checkouts, not failed settlements; the two expired records are terminal expired checkouts. This dashboard count is an observed UI snapshot, not a substitute for a fresh D1 audit. It does not prove that the scheduled reconciliation Worker caused the settlement.
> - **Settled-read integrity:** commits `3dc7e973` and `e2d1916d` make settled status reads return persisted immutable evidence without provider polling or lifecycle mutation, and add a regression test. CI and Preview deployment for these two commits still need verification.
> - **Merchant integration:** the Developers section now includes one-time merchant API-key issuance/rotation and copyable server/browser integration examples. `POST /api/merchant-api-key` returns the plaintext once with `Cache-Control: no-store`; rotation invalidates the previous key. The standalone embed build now explicitly replaces React's `process.env.NODE_ENV` reference for browser execution. Commit `d104aff` fixes the standalone embed's Node-only `process.env.NODE_ENV` reference. CI runs #487–#490 passed; Preview deployment `bf42d182` succeeded. Browser Rendering smoke-tested the standalone widget: custom element registration, Shadow DOM mount, launcher and checkout dialog all worked using a placeholder order and invalid token. No payment was attempted. The authenticated API-key rotation flow and a real merchant-created checkout session remain untested.
> - **Merchant access:** Preview password recovery has now been exercised successfully. The one-time reset token was redeemed, the password was updated, prior sessions were revoked, and the merchant subsequently signed in. Recovery is Preview-only and operator-assisted through restricted Pages runtime logs; no email delivery is configured. Do not describe password recovery as unimplemented.
> - **Background reconciliation:** Preview D1 migrations 0017 and 0019 are applied. Cloudflare previously confirmed Preview Worker `pelargo-expiry-sweeper-preview` deployment `52733dc2-06be-4c7d-9a51-7e7c1a433074` and active cron `*/5 * * * *`. The encrypted `RECONCILIATION_SECRET` value cannot be read back through the API and its installation is not independently proven by the evidence recorded here. A successful scheduled settlement run has not been established. Do not attribute the existing settlement to the Worker without execution evidence.
> - **Database:** the current branch contains migrations 0001–0019. A fresh read-only query of Preview D1 `d1_migrations` on 7 November confirms all 19 migrations are applied, including `0019_reconciliation_backfill_eligible_states.sql` (D1 migration record id 18) and `0018_preview_password_reset.sql` (record id 19). The record IDs reflect application order, not filename order. Production D1 was not queried or changed.
> - **Remaining submission work:** complete an independent merchant-origin browser acceptance test using a real merchant-created session; exercise API-key issuance/rotation and authenticated server-side order lookup; establish Worker secret installation and scheduled invocation evidence without triggering an unreviewed payment; capture a reproducible demo; finish submission documentation and publish the required public demo post.
> - **Release controls:** do not merge PR #4, modify Production D1/configuration, deploy Production, enable mainnet payments, or initiate another payment without explicit approval.
>
> Read `docs/PROJECT_STATUS.md` for the chronological engineering record, `docs/INTEGRATION.md` for the merchant integration contract, and `SCOPE.md` for the current hackathon scope. Dated entries below are historical unless repeated in this handover.

Pelargo is an embeddable crypto checkout for merchants. It uses NEAR Intents / 1Click to quote cross-chain payment routes, while the merchant receives a configured destination asset when the route is supported.

The checkout widget is the product. The merchant workspace exists to configure and integrate checkout; Pelargo is not a storefront builder.

## Hackathon scope

The immediate goal is a credible end-to-end **testnet demonstration**, not a production payment platform.

The demo needs to prove a small number of things:

1. A merchant can create an order and issue a short-lived checkout session.
2. A buyer can discover available assets, request a quote and see payment instructions.
3. Pelargo can observe the provider's payment status.
4. For a supported NEAR NEP-141 destination, Pelargo can independently verify the transaction before marking the order paid.
5. The merchant can retrieve the resulting order status through an authenticated API.

Keep the implementation focused on this path. Do not add more chains, more indexer providers, a proprietary indexer, self-serve merchant billing, provider redundancy or production operations work just to broaden the architecture. Revisit those only when the demo exposes a concrete need.

## Checkout flow

1. The merchant backend creates an order through `POST /api/checkout-session`.
2. Pelargo returns a short-lived signed session token. The merchant passes it to the browser widget; the merchant API key stays server-side.
3. The widget discovers provider-supported assets and requests a dry quote.
4. A committed quote requests real deposit instructions. This is a payment action, not a preview.
5. Pelargo polls 1Click and treats provider `SUCCESS` only as a signal to verify the destination transaction.
6. The NEAR verifier resolves the transaction signer through a network-matched indexer, then asks canonical NEAR RPC to verify final execution and the exact token transfer.
7. Only a matching verified transfer can mark the order paid.

## Historical verification snapshot — 5 November 2026 (superseded where noted above) (superseded by the current handover above)

- Operational branch: `ops/live-d1-readiness`; application integration branch: `build/live-intents`. `main` remains untouched.
- Preview is configured with isolated D1 and Tidepool testnet provider settings. `ALLOW_TESTNET_DEPOSITS=true` enables only testnet committed quotes; mainnet commits remain disabled.
- The widget supports dry-quote preview, buyer-confirmed committed-quote creation, and display of the provider's deposit address/memo, exact committed source amount and deadline. It does not connect a wallet or submit the source transfer; the buyer sends funds from their own wallet.
- Buyer payment-status polling is scoped to the session's own committed order. Merchant server integrations use the merchant API key; the dashboard uses an HttpOnly merchant session cookie. The dashboard's manual **Check status** action shows per-order progress and has client/server timeouts. Destination-hash parsing was corrected to accept both string and `{ hash }` provider representations, with a regression test; the fix is deployed to Preview. A live post-deployment check against the existing order is still pending.
- Self-service merchant registration/login, persisted destination settings, dashboard order creation and merchant-scoped activity APIs have been added. CI has covered type-checking, checkout-session security, checkout API integration and frontend build; see the project status handover for commit-specific evidence.
- Preview migrations `0012` through `0016` have been applied to the isolated Preview D1 database. The source-deposit recovery endpoint was exercised against the existing live order: Pelargo verified the submitted Base Sepolia deposit and notified Tidepool.
- **Live testnet payment:** order `ORDER-83587591`, Tidepool quote `6fd9fef3-a12d-4347-a73f-e250c3acd40d`. The buyer sent `1.012633` Base Sepolia USDC to the committed deposit address in transaction `0x6ccc936c0de29f926478ce525434ef3b26c2ccb792efbdfab10a75471ad9553d`. At that historical checkpoint, the dashboard recovery action returned: “Source deposit verified and provider notified. Provider status: PROCESSING. Settlement: pending provider confirmation.” The later canonical settlement evidence is recorded in the current handover.
- The buyer then supplied successful NEAR testnet transaction `vif8EKtCAzHcaihLNuC6XaRMhCzEDxUiHbAJJRQVUVE`. The explorer details report an `execute_intents` transaction at block `276344865` and a transfer of 1 Tidepool Testnet USDC to `agentg.testnet`. Pelargo has **not** yet independently verified the exact NEP-141 token contract, recipient, net amount and finality through its own verifier, or persisted settlement evidence. At that historical checkpoint the order remained `processing`; this was superseded by the canonical settlement evidence recorded in the current handover.
- Provider status was still `PROCESSING` at the last observed check. The destination explorer report is evidence supplied by the buyer, not a substitute for Pelargo's canonical RPC verification. Do not send another payment or manually mark this order paid.
- Added hash-scoped NEAR signer recovery configuration for the one existing order. Preview variables are bound to `ORDER-83587591`, transaction `vif8EKtCAzHcaihLNuC6XaRMhCzEDxUiHbAJJRQVUVE`, and signer `maker.tidepool-sandbox.testnet`; the configured signer is only a hint and canonical NEAR RPC must still prove final execution and exact NEP-141 transfer.
- CI passed on commit `55a9b62e10456749fb145f22b18bc14fee15ba4` (workflow run `42059187806`). Regression coverage exercises named RPC parameters, hash-scoped signer use, wrong signer, wrong amount, exact token/recipient and finality.
- Preview deployment `feeef960` completed successfully from the recovery branch at 15:56 UTC. The recovery variables are Preview-only. No live order check has yet been run against this deployment, so settlement remains unverified.
- Production is unchanged, `main` has not been merged, and mainnet deposits remain disabled.

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the exact verification record and next sequence.

## What is implemented

- Public merchant registration and password login, with PBKDF2-SHA-256 (100,000 iterations, the Cloudflare Workers WebCrypto ceiling), per-account random salts, and a server-side HMAC-SHA-256 pepper derived from `ORDER_SESSION_SECRET`; database-backed login/registration throttling and seven-day opaque HttpOnly Secure SameSite=Lax sessions.
- Merchant-scoped destination settings, dashboard order creation and order activity APIs.
- Dashboard cookie authentication and server-side merchant API-key authentication remain separate; internal API keys are never returned to the browser.
- Merchant-authenticated order and checkout-session creation.
- Short-lived HMAC-signed sessions bound to merchant, order, amount, destination asset and recipient.
- Session replay protection and merchant-scoped order lookup.
- Provider asset discovery, dry quote handling and committed-quote persistence.
- Authenticated provider status polling with stale-response protection; concurrent polls return the latest persisted state instead of a misleading conflict.
- Independent Base Sepolia ERC-20 source-deposit verification (chain ID, receipt hash/status, exact token contract, deposit recipient, exact amount and 12-confirmation minimum), immutable source evidence, and authenticated `/api/deposit-submit` notification to Tidepool.
- NEAR destination settlement verification runs when a correlated destination transaction hash is available, even if Tidepool still reports `PROCESSING`; only finalized exact NEP-141 transfer evidence can mark an order paid.
- Merchant/buyer-authorized recovery of the original source asset, exact input amount, output amount and deadline from the provider's original quote response, without creating another quote.
- A NEAR NEP-141 settlement verifier with exact token-contract, recipient and net-amount checks.
- Database guards that prevent an order being marked paid without matching settlement evidence.
- An operator recovery-case endpoint for ambiguous quote-commit outcomes.

## Important limits

- **Routing support is not settlement support.** A route offered by 1Click does not mean Pelargo can verify settlement on that destination.
- The only implemented settlement verifier is for NEAR NEP-141 tokens. EVM, Solana, Bitcoin, native NEAR and other destinations are not verified by Pelargo.
- Provider selection is server-side and allowlisted: unset `INTENTS_API_BASE_URL` selects official 1Click mainnet; `https://www.usetidepool.tech` selects the community Tidepool testnet sandbox. Mainnet partner JWTs are never forwarded to Tidepool.
- Testnet signer lookup is configured to use NearBlocks v3 `GET /v3/txns/{hash}` and hash-bound `transaction_hash` / `signer_account_id` fields. Mainnet uses NearScanner's `hash` / `signer_id` fields. These response shapes are covered by mocks, not yet confirmed against a live transaction. The indexer only resolves the signer; NEAR RPC verifies execution, token transfer details and finality.
- RPC defaults follow the provider network and the verifier checks RPC `chain_id` before transaction verification.
- Committed quotes remain disabled by default. `ALLOW_TESTNET_DEPOSITS=true` enables only Tidepool testnet commits; `ALLOW_MAINNET_DEPOSITS=true` remains a separate mainnet-only switch.
- NearBlocks testnet signer parsing accepts object and array response envelopes, with a regression fixture for the array form. The live response shape for the completed destination transaction has not yet been confirmed in Pelargo's runtime. This statement is historical and superseded by the 7 November handover: Preview D1 now contains immutable canonical settlement evidence for ORDER-83587591.
- The browser widget is an integration prototype, not a finished production checkout SDK. Do not use it to collect real customer funds.
- Tidepool publishes a 31/31 conformance report against official 1Click OpenAPI and real NEAR testnet transaction examples. Pelargo has completed a live committed quote and source deposit on testnet and received a buyer-reported successful destination transaction. This statement is historical and superseded by the 7 November handover: Pelargo has persisted canonical NEAR settlement evidence for ORDER-83587591.
- NearBlocks testnet API access and live response behavior in Pelargo Preview remain to be confirmed against the completed order.

## What is deliberately out of scope for the hackathon

Do not spend hackathon time on:
- Supporting every chain exposed by the routing provider.
- Building or operating our own transaction indexer.
- Integrating multiple indexer vendors before the current one has been tested.
- Merchant billing, multi-user organisations, email verification or enterprise identity management. API-key issuance and rotation are now implemented in the Developers section. Preview password recovery has been exercised successfully; it is an operator-assisted, Preview-only flow and does not provide email delivery.
- Production-grade redundancy, monitoring and incident operations.
- Mainnet payment activation.

These are possible later product requirements, not prerequisites for demonstrating the core checkout and verification flow.

## API surface

- `POST /api/checkout-session` — merchant-authenticated order/session creation.
- `GET /api/checkout-session?token=...` — validate/retrieve public session claims.
- `GET /api/tokens` — provider-supported asset discovery.
- `POST /api/quote` — session-bound dry or committed quote request.
- `GET /api/order?orderId=...` — merchant-scoped order lookup.
- `GET /api/orders` — dashboard activity list for the authenticated merchant.
- `GET/PUT /api/merchant-settings` — retrieve and persist merchant destination settings.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout` — merchant account and session lifecycle.
- `GET /api/payment-status?orderId=...` — merchant-scoped provider polling, recovery of original committed-quote deposit instructions when returned by the provider, and eligible NEAR settlement verification.
- `POST /api/deposit-submit` — merchant-authenticated source transaction recovery; verifies the exact Base Sepolia ERC-20 deposit against the provider quote before notifying Tidepool.
- `GET /api/operator/recovery-cases` — operator-authenticated read-only queue for ambiguous quote commits.
- `GET /api/status` — retired; returns HTTP 410.

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for merchant request contracts and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the current implementation and verification record.

## Database

Migrations `0001` through `0019` are in the current repository branch. Successful Preview password recovery confirms the deployed reset path and its required database schema are functioning. Preview migration `0017` was previously applied and read back; migration `0019` application remains unverified and must be checked before relying on its background-job backfill. Production migration state has not been checked or changed. Do not apply production migrations as part of ordinary hackathon testing.

## Safety boundaries

- Keep `ALLOW_MAINNET_DEPOSITS` unset. Mainnet committed quotes and deposits are not part of the hackathon testnet demo.
- Use testnet assets only for the demo, after confirming every provider and verifier endpoint is configured for the same network.
- Never expose merchant API keys, `MERCHANT_PROVISIONING_SECRET`, `ORDER_SESSION_SECRET` or indexer credentials in browser code or public repositories.
- A quote, deposit address, detected deposit or provider `SUCCESS` is not proof of settlement.
- Do not merge to `main` or deploy production without explicit release authorization.

## Repository and development

- Repository: [BigWave45/Pelargo](https://github.com/BigWave45/Pelargo)
- Current development branch: `reliability/background-reconciliation`
- Earlier application integration baseline: `build/live-intents`
- Earlier operational branch: `ops/live-d1-readiness`
- Cloudflare Pages project: `pelargo`

Stack: React, TypeScript, Vite, Cloudflare Pages Functions, Cloudflare D1 and NEAR Intents / 1Click.

Run locally:

```bash
bun install
bun run dev
bun run test:security
bun run test:api
bun run build
```

## License

MIT


### Committed payment recovery after checkout-session expiry

If a buyer's short-lived checkout token expires after the quote was committed, the same signed token can still be used to read and poll only its own committed order. The API verifies the signature and exact persisted session/order binding and requires the session to remain in the `committed` state. This recovery exception does not allow quote creation, session reactivation, or access to another order. Uncommitted and expired checkout sessions remain rejected.


## Settlement reconciliation audit — 5 November 2026

A read-only audit of Preview D1 and the deployed Pages metadata found two concrete defects in the previous recovery attempt:

1. The Preview project configuration and deployed build metadata contain none of `NEAR_TX_HASH`, `NEAR_TX_SIGNER_ID` or `NEAR_TX_ORDER_ID`. The earlier handover statement that these variables were configured was incorrect. The known buyer-supplied transaction was therefore not enabled through that recovery configuration.
2. The application verifies multiple candidate hashes, but the D1 `payment_settlement_evidence_insert_guard` requires an inserted evidence row to match the single `payment_lifecycle.destination_tx_candidate`. A valid later candidate can therefore be rejected by the database unless the verified candidate is persisted atomically with evidence insertion.

For `ORDER-83587591`, Preview D1 currently records the verified Base Sepolia source deposit (1,012,633 atomic units), lifecycle `processing`, provider status `PROCESSING`, and candidate `6Y2GiawNNnwG3vu4rDhMh2enZJxhCvXJevKesHLw8cay`. No destination settlement-evidence row exists. The checkout order remains `quote_committed` by design until the settlement trigger promotes it to `paid`; this is not itself a state inconsistency.

The deployed Preview build is commit `55a9b62e10456749fb145f22b18d9e6b457a80a2`. Cloudflare's deployment metadata confirms build and upload stages succeeded, but this is not evidence of browser runtime health. The active Preview environment variable list contains only `ALLOW_TESTNET_DEPOSITS`, `INTENTS_API_BASE_URL`, `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET` (secret values are not recorded here).

The next implementation must preserve strict settlement guards and make candidate selection, evidence insertion and lifecycle settlement a single atomic operation. It must add regression coverage where the first provider candidate is invalid but a later candidate is valid. No manual settlement, new payment, Production change, main merge or mainnet activation is authorized by this audit.


## Backend reliability implementation — 5 November 2026

The first reliability change is limited to settlement diagnosis; it does not alter provider execution or settlement authorization. The GET /api/payment-status endpoint now preserves per-candidate verifier exceptions alongside normal rejection stages. When several NEAR transaction candidates are checked, an upstream RPC/indexer error for one candidate is recorded with that exact hash and bounded error detail while later candidates are still checked. If no candidate verifies and at least one verifier call failed exceptionally, the endpoint returns HTTP 503 with the candidate-specific diagnostic set rather than silently retaining only the last exception. A normal chain mismatch remains an awaiting-verification result and cannot create settlement evidence.

Regression coverage asserts that a wrong net NEP-141 transfer amount is reported against the exact transaction candidate. Existing tests continue to enforce the database settlement evidence guard and atomic settlement batch rollback.

This change does not add background reconciliation, retry provider execution, change payment state transitions, relax database guards, modify financial accounting, or deploy anything. GitHub Actions CI passed on commit 3f9251b182ba2a0a407c6c069526a000664bbf01 (run 42097755714), including type-check, checkout-session security tests, checkout API integration tests and frontend build. Live NEAR RPC verification remains pending.


## Durable background payment reconciliation — implementation in progress — 5 November 2026

Committed payments with a persisted deposit address are now scheduled for background reconciliation by a D1-backed job table (migrations/0017_payment_reconciliation_jobs.sql). Lifecycle triggers enqueue newly eligible orders; the migration backfills only existing deposit-detected, processing and incomplete-deposit orders, avoiding stale awaiting-deposit test checkouts; terminal lifecycle states remove their jobs. Jobs use conditional D1 lease claims, so concurrent cron invocations cannot both own the same unexpired lease.

The scheduled Worker reuses the existing GET /api/payment-status implementation in-process through a private, secret-authenticated internal path. This preserves the existing provider polling, candidate verification, immutable settlement evidence and database settlement guards. It does not create quotes, submit deposits, retry provider execution or mark payments paid from provider status alone. Retryable outcomes release the lease and schedule an exponential retry capped at one hour.

The Preview Worker configuration explicitly selects Tidepool testnet and the isolated Preview D1 database. RECONCILIATION_SECRET is required only as an encrypted secret on this Worker; the in-process status verifier uses the same Worker Env binding. Migration 0017 has now been applied to isolated Cloudflare Preview D1. The existing processing order was backfilled as one durable job. The Worker is not deployed, its secret is not configured, and the cron is not active. Production Worker configuration and Production D1 are unchanged.

Automated integration coverage has been added for trigger enqueueing, internal worker polling, lease release, retry scheduling and the invariant that a provider PROCESSING response cannot settle an order. GitHub Actions CI passed on commit bcc8b982061cb034e59bb2a2fb5087b3cfdbc6aa (run 42099838987): type-check, checkout-session security tests, checkout API integration tests and frontend build. Failure-injection coverage subsequently passed on commit abc5defc2ca8ed1ee4f30dafb52db136a56c92ae (run 42099998224).


### Background reconciliation reliability tests — 5 November 2026

The integration suite covers durable enqueue, provider timeout, lease release and retry scheduling, recovery after an expired lease, refusal to steal a live lease, concurrent workers claiming distinct due jobs, terminal-state job cleanup, rejection of an incorrect internal secret, and the invariant that a provider PROCESSING response cannot settle an order.

GitHub Actions passed on the current test commit c7ab5aa94f5add34b6d90d5a2e286f804e8af248 (run 42104154492): TypeScript type-check, checkout-session security tests, checkout API integration tests and frontend build. These tests use in-memory SQLite and mocked provider responses. They do not prove live Cloudflare D1 concurrency behavior, live NEAR RPC availability, or successful scheduled execution in Cloudflare.

Migration 0017 is applied to isolated Cloudflare Preview D1 and read-back confirmed. One job exists for the existing processing order ORDER-83587591. The Worker remains undeployed, its secret is not configured, and its cron is inactive. No Production changes or payment execution occurred.

The Preview Worker config also carries the non-secret, order-scoped NEAR recovery tuple for the existing testnet payment (`ORDER-83587591`): transaction hash `vif8EKtCAzHcaihLNuC6XaRMhCzEDxUiHbAJJRQVUVE`, signer hint `maker.tidepool-sandbox.testnet`, and matching external order ID. This is necessary because Worker bindings are separate from Pages Preview bindings. The signer hint is not trusted as settlement evidence; canonical NEAR RPC must still verify the exact transaction and NEP-141 transfer. The tuple is not included in the Production Worker config.


Preview migration 0017 was applied on 5 November 2026 to D1 database 0335acdc-f0e0-42f6-ba87-e3448fb91728. Read-back confirmed the migration ledger entry, all three reconciliation triggers, and one queued job for the existing processing payment ORDER-83587591. The three old awaiting-deposit test checkouts were intentionally excluded from the one-time backfill. The scheduled Worker remains inactive.


### Manual Preview Worker deployment — 6 November 2026

- Added a manually dispatched GitHub Actions workflow restricted to branch `reliability/background-reconciliation` and the GitHub `preview` environment. It uses Cloudflare Wrangler Action v4 with Wrangler 4.136.3 pinned.
- The workflow validates the fixed Cloudflare account ID and a 32-character minimum secret before deployment. It dry-runs the no-cron bootstrap config, deploys the Worker without a schedule, installs the encrypted `RECONCILIATION_SECRET`, dry-runs the scheduled config (which declares the secret required), and only then deploys the five-minute Cron Trigger.
- Post-deploy verification reads Cloudflare's Worker schedules and settings APIs and fails unless the expected cron and isolated Preview D1 binding are present.
- Required GitHub Actions environment secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (must equal the Preview account ID pinned in the workflow), and a randomly generated `RECONCILIATION_SECRET` of at least 32 characters. Secret values are not stored in the repository.
- The Worker secret is not also required on Pages: the Worker invokes the existing payment-status handler in-process with its own Env object.
- The five-minute Worker also runs the pre-existing abandoned-checkout expiry and uncertain-quote recovery sweeps. These remain scoped to Preview D1 by the config.
- Workflow implementation is committed but not dispatched. No Worker has been deployed and no cron has been activated.

- GitHub Actions CI passed on the current implementation/documentation head c5684554c4b15e8184b5d4b286813e5417182b52 (run 42168439303): type-check, checkout-session security tests, checkout API integration tests and frontend build. The workflow itself is manually dispatched and has not been run because its GitHub environment credentials are not yet configured.

## Verification checkpoint — 6 November 2026 (dashboard observation)

The merchant dashboard now displays the existing test order `ORDER-83587591` as `settled`, with the displayed date `05/11/2026, 13:59:55`. This is a user-observed dashboard state, not yet independently reconciled against the Preview D1 settlement evidence or a canonical NEAR RPC result. Earlier Preview Worker telemetry showed a scheduled sweep with `claimed: 0`, `settled: 0`, and `deferred: 0`; an earlier read-only query of `payment_reconciliation_jobs` returned no rows. The cause of the dashboard/D1/Worker discrepancy is unresolved. Do not claim that the background Worker settled this order, and do not use this dashboard label alone as proof of destination-chain settlement.

The next test should use a fresh external order ID and the isolated Preview environment. Before any source transfer, verify the merchant identity/environment, destination asset and recipient, provider quote, exact source asset and amount, deposit address/memo, and quote expiry. The buyer must explicitly review the payment instructions and send the testnet transfer from their own wallet. Record source-chain transaction evidence, the corresponding Preview D1 lifecycle/job row, Worker claim/result telemetry, canonical destination NEAR RPC verification, and immutable settlement evidence. Do not reuse the prior order or quote. Production, mainnet, and `main` remain out of scope.
