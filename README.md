# Pelargo

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
6. The NEAR verifier resolves the transaction signer through NearScanner, then asks canonical NEAR RPC to verify final execution and the exact token transfer.
7. Only a matching verified transfer can mark the order paid.

## What is implemented

- Merchant-authenticated order and checkout-session creation.
- Short-lived HMAC-signed sessions bound to merchant, order, amount, destination asset and recipient.
- Session replay protection and merchant-scoped order lookup.
- Provider asset discovery, dry quote handling and committed-quote persistence.
- Authenticated provider status polling with stale-response protection.
- A NEAR NEP-141 settlement verifier with exact token-contract, recipient and net-amount checks.
- Database guards that prevent an order being marked paid without matching settlement evidence.
- An operator recovery-case endpoint for ambiguous quote-commit outcomes.

## Important limits

- **Routing support is not settlement support.** A route offered by 1Click does not mean Pelargo can verify settlement on that destination.
- The only implemented settlement verifier is for NEAR NEP-141 tokens. EVM, Solana, Bitcoin, native NEAR and other destinations are not verified by Pelargo.
- The current NearScanner adapter uses `GET /api/v1/explorer/tx/{hash}` and expects a hash-matched transaction object containing `signer_id`. The endpoint's complete authentication and response contract has not yet been live-verified. Mocked tests are not proof that the live endpoint works.
- NearScanner is only used to resolve the signer. NEAR RPC remains the authority for transaction execution, receipt success, token transfer details and finality.
- The current verifier defaults to NEAR **mainnet RPC** unless `NEAR_RPC_URL` is set. A testnet demo must explicitly configure a matching testnet RPC and confirm the selected Intents route and NearScanner lookup support the same network before attempting a payment. Do not assume testnet compatibility from the current code.
- The browser widget is an integration prototype, not a finished production checkout SDK. Do not use it to collect real customer funds.
- Live 1Click quote/status compatibility, live NearScanner authentication/response compatibility and a complete live chain-verification run remain outstanding.

## What is deliberately out of scope for the hackathon

Do not spend hackathon time on:
- Supporting every chain exposed by the routing provider.
- Building or operating our own transaction indexer.
- Integrating multiple indexer vendors before the current one has been tested.
- Merchant billing, multi-tenant SaaS administration or a full self-serve onboarding system.
- Production-grade redundancy, monitoring and incident operations.
- Mainnet payment activation.

These are possible later product requirements, not prerequisites for demonstrating the core checkout and verification flow.

## API surface

- `POST /api/checkout-session` — merchant-authenticated order/session creation.
- `GET /api/checkout-session?token=...` — validate/retrieve public session claims.
- `GET /api/tokens` — provider-supported asset discovery.
- `POST /api/quote` — session-bound dry or committed quote request.
- `GET /api/order?orderId=...` — merchant-scoped order lookup.
- `GET /api/payment-status?orderId=...` — merchant-scoped provider polling and eligible NEAR settlement verification.
- `GET /api/operator/recovery-cases` — operator-authenticated read-only queue for ambiguous quote commits.
- `GET /api/status` — retired; returns HTTP 410.

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for merchant request contracts and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the current implementation and verification record.

## Database

Migrations `0001` through `0011` are in the repository. Preview D1 has been migrated through `0011`; production migration state must be checked separately. Do not apply production migrations as part of ordinary hackathon testing.

## Safety boundaries

- Keep `ALLOW_MAINNET_DEPOSITS` unset. Mainnet committed quotes and deposits are not part of the hackathon testnet demo.
- Use testnet assets only for the demo, after confirming every provider and verifier endpoint is configured for the same network.
- Never expose merchant API keys, `MERCHANT_PROVISIONING_SECRET`, `ORDER_SESSION_SECRET` or indexer credentials in browser code or public repositories.
- A quote, deposit address, detected deposit or provider `SUCCESS` is not proof of settlement.
- Do not merge to `main` or deploy production without explicit release authorization.

## Repository and development

- Repository: [BigWave45/Pelargo](https://github.com/BigWave45/Pelargo)
- Application integration branch: `build/live-intents`
- Current operational branch: `ops/live-d1-readiness`
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
