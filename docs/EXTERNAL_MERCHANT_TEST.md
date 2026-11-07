# External merchant integration acceptance

## Purpose

This acceptance test exercises Pelargo as an independent merchant server, not through the Pelargo dashboard. It verifies merchant API authentication, signed buyer-session issuance, merchant-scoped order retrieval, duplicate-order rejection and the pre-payment lifecycle boundary.

The test is deliberately non-payment. It does not call the quote endpoint, commit a provider quote, request deposit instructions, connect a wallet or transfer funds.

## Preview target

Use the non-production Preview deployment for the `test/external-merchant-integration` branch after Cloudflare Pages reports a successful deployment. Do not point this test at Production.

## Run

Use a trusted server or local development environment. Do not put the merchant key in browser JavaScript, a public repository, a URL, a screenshot or chat.

Set:

```sh
PELARGO_API_URL=https://<verified-preview-host>
PELARGO_MERCHANT_API_KEY=<new-test-merchant-key>
PELARGO_TEST_RECIPIENT=agentg.testnet
```

Then run:

```sh
npm run test:external-merchant
```

Or:

```sh
PELARGO_API_URL=... PELARGO_MERCHANT_API_KEY=... node scripts/external-merchant-smoke.mjs
```

The script creates one uniquely named pending order for 1 USDC on the configured NEAR testnet destination. It uses the merchant's saved recipient value supplied to the script (default `agentg.testnet`). Confirm the test merchant destination matches before running.

## Assertions

- Invalid merchant key returns HTTP 401.
- Merchant API key creates a checkout session (HTTP 201).
- Signed buyer bearer token validates through `GET /api/checkout-session`.
- Merchant can retrieve its own pending order through `GET /api/order`.
- Reusing the same external order reference returns HTTP 409.
- A second merchant key, when supplied, cannot retrieve the first merchant's order (HTTP 404).
- An order with no committed quote has no deposit/payment status (`DEPOSIT_NOT_CREATED`, HTTP 409).

Set `PELARGO_OTHER_MERCHANT_API_KEY` to enable the cross-merchant isolation assertion.

## Cleanup

The test creates one pending Preview order and leaves its signed checkout session uncommitted. No payment is expected. The unique order reference is printed at completion so it can be identified in the merchant dashboard. Do not attempt to pay it.

## What this does not prove

This is not the final buyer payment acceptance test. It does not prove wallet execution, provider deposit detection, source-chain verification, destination settlement, merchant webhooks, scheduled reconciliation or production readiness. Those are separate acceptance items.
