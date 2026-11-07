# External merchant integration acceptance

## Purpose

This acceptance test exercises Pelargo as an independent merchant server, not through the Pelargo dashboard. It verifies merchant API authentication, signed buyer-session issuance, merchant-scoped order retrieval, duplicate-order rejection and the pre-payment lifecycle boundary.

The test is deliberately non-payment. It does not call the quote endpoint, commit a provider quote, request deposit instructions, connect a wallet or transfer funds.

## Preview target

The hosted GitHub Actions workflow checks out `reliability/background-reconciliation` and targets `https://reliability-background-recon.pelargo.pages.dev`. It is manually triggered and uses repository Actions secrets. Do not point this test at Production.

## Run

Use a trusted server or local development environment. Do not put the merchant key in browser JavaScript, a public repository, a URL, a screenshot or chat.

For the hosted acceptance run, configure the repository Actions secrets `PELARGO_TEST_MERCHANT_API_KEY` and `PELARGO_OTHER_TEST_MERCHANT_API_KEY` with keys from two separate Preview test merchants. The workflow sets the Preview URL and test recipient. Do not paste keys into chat or commit them.

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

The hosted workflow supplies the second merchant key through `PELARGO_OTHER_TEST_MERCHANT_API_KEY`; the cross-merchant isolation assertion is included in the seven-check acceptance run.

## Cleanup

The test creates one pending Preview order and leaves its signed checkout session uncommitted. No payment is expected. The unique order reference is printed at completion so it can be identified in the merchant dashboard. Do not attempt to pay it.

## What this does not prove

This is not the final buyer payment acceptance test. It does not prove wallet execution, provider deposit detection, source-chain verification, destination settlement, merchant webhooks, scheduled reconciliation or production readiness. Those are separate acceptance items.
