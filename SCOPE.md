# Pelargo — Hackathon Scope and Submission Checklist

**Current as of 7 November 2026**

## Product

Pelargo is an embeddable, non-custodial crypto checkout for merchant websites and applications. The checkout widget is the product. The merchant workspace exists to configure destination settlement and integrate the widget; Pelargo is not a storefront builder.

A merchant creates an order and checkout session on its server. The buyer selects a supported source asset, previews a dry quote, explicitly confirms a committed quote, and receives provider deposit instructions. The buyer sends the source asset manually from their own wallet. Pelargo tracks provider progress and independently verifies supported destination settlement before marking the order paid.

## Hackathon objective

Demonstrate a credible testnet checkout and settlement-verification path. This is not a production payment platform.

The implemented destination verifier supports NEAR NEP-141 tokens only. Routing availability through NEAR Intents / 1Click does not imply that Pelargo can verify settlement on every destination chain.

## Implemented and evidenced

- [x] Merchant registration, login, session handling and merchant dashboard on Preview.
- [x] Preview password recovery successfully exercised; password updated, previous sessions revoked, and merchant sign-in confirmed. Recovery is operator-assisted through restricted Preview runtime logs; email delivery is not configured.
- [x] Merchant destination settings and merchant-scoped order APIs.
- [x] Merchant-authenticated checkout-session creation and short-lived signed buyer sessions.
- [x] Provider asset discovery, dry quote preview and explicit committed-quote flow.
- [x] Provider deposit instructions are validated and displayed; buyer sends funds from their own wallet.
- [x] Base Sepolia source-deposit verification and provider notification.
- [x] Canonical NEAR RPC verification of an exact NEP-141 destination transfer, with immutable settlement evidence persisted in Preview D1 for `ORDER-83587591`.
- [x] Merchant dashboard access restored; the 7 November order-history view shows six records: one `settled`, three `awaiting_deposit`, and two `expired`. The three awaiting-deposit records are unpaid checkouts; the two expired records are terminal expiries. This is a dashboard observation, not a fresh D1 reconciliation.
- [x] Settled payment status handler changed to return persisted immutable evidence without polling the provider or mutating lifecycle state; regression test added. CI and Preview deployment for these latest commits still require verification.

## Implemented but not operationally verified

- [ ] Migration 0019 backfill applied to Preview D1 and read back.
- [ ] Preview background reconciliation Worker deployed with the required encrypted secret and five-minute cron.
- [ ] Scheduled Worker claims and processes an eligible job against Preview D1. Do not infer this from the existing settled order; the settlement has not been attributed to the Worker.
- [ ] Latest settled-read integrity commits have passing CI and are present in the active Preview deployment.

The Worker workflow is manual and Preview-only. Dispatching it also activates existing Preview expiry and uncertain quote-commit recovery sweeps. Review that side effect and obtain explicit operational authorization before dispatch.

## Remaining submission work

1. Verify CI and Preview deployment for commits `3dc7e973` and `e2d1916d`.
2. Verify whether migration 0019 is applied to Preview D1. Do not touch Production D1.
3. Reproduce the complete merchant integration path using the actual embedded widget: merchant creates order/session, widget mounts on a separate merchant page, buyer previews and commits a quote, buyer sends testnet funds, Pelargo verifies settlement, and merchant reads the paid order. Use a fresh test order only when required and keep it on Preview/Tidepool testnet.
4. Decide whether to deploy the Preview reconciliation Worker. If deployed, verify the exact Worker name, Preview D1 binding, secret presence, cron activation, job claim, and settlement outcome in logs and D1. Do not claim automated reconciliation until those observations exist.
5. Capture a short, reproducible demo showing merchant integration, buyer checkout, and verified settlement. Avoid exposing credentials, bearer tokens, reset links or secrets.
6. Finalize README and integration instructions against the verified implementation.
7. Publish the required public demo post on X and submit the public repository/demo links before the hackathon deadline.

## Explicit non-goals

- Mainnet payment activation or production customer funds.
- Production deployment or Production D1 changes.
- More destination settlement verifiers or additional indexer providers.
- Building a proprietary transaction indexer.
- Merchant billing, multi-user organisations, email verification, API-key rotation or enterprise identity management.
- Production operations, redundancy or monitoring work beyond what is required to demonstrate the testnet flow.
- A demo storefront such as Northwind Goods.

## Safety boundaries

- Keep `ALLOW_MAINNET_DEPOSITS` unset.
- Use Tidepool testnet and verify network alignment across provider, source-deposit verifier and destination NEAR RPC.
- Never expose merchant API keys, `ORDER_SESSION_SECRET`, `RECONCILIATION_SECRET`, `MERCHANT_PROVISIONING_SECRET`, indexer credentials or one-time reset URLs.
- A quote, deposit address, detected source deposit or provider `SUCCESS` is not proof of destination settlement.
- Only persisted, matching canonical settlement evidence can justify the paid state.
- No merge to `main`, Production deployment, Production D1 mutation, Worker dispatch or new payment without the required explicit authorization.

## Repository and active branch

- Repository: https://github.com/BigWave45/Pelargo
- Active development branch: `reliability/background-reconciliation`
- Draft PR #4 remains unmerged.
- `main` is not the active implementation branch.

See [README.md](README.md), [docs/INTEGRATION.md](docs/INTEGRATION.md), and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for product, API and chronological engineering details.
