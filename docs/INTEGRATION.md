# Merchant integration guide

This guide describes the current integration prototype. It is not a production payment integration: committed quotes are disabled by default, NEAR mainnet NEP-141 settlement verification is implemented but tested only with mocked RPC/indexer responses, and merchant webhooks are not implemented.

## Trust boundary

There are two separate servers:

- **Merchant server:** owns the merchant API key, creates the merchant order, chooses the trusted amount and settlement destination, and requests a Pelargo checkout session.
- **Buyer browser:** receives only the short-lived signed session token and public order details. It must never receive the merchant API key or provisioning secret.

Do not let the browser choose or override the amount, destination asset, recipient, merchant identity or order reference used to authorize the payment. The signed session binds those values. The buyer may choose a supported source asset and provide a refund address.

## 1. Merchant server: create a session

After creating or validating an order in your own database, your server calls Pelargo's `POST /api/checkout-session` endpoint.

Example using a Node.js server handler. The example assumes the merchant has already been provisioned and that the environment contains the merchant's API key. Keep this key server-side.

```ts
const PELARGO_API = process.env.PELARGO_API_URL!;
const PELARGO_MERCHANT_KEY = process.env.PELARGO_MERCHANT_KEY!;

// Example values must come from your trusted order and settlement records.
// Resolve destination decimals from the exact supported asset metadata.
async function createPelargoSession(order: {
  id: string;
  amount: string;          // e.g. "25.00"
  amountAtomic: string;    // e.g. "25000000" for a 6-decimal asset
  destinationAsset: string;
  destinationSymbol: string;
  destinationNetwork: string;
  recipient: string;
}) {
  const response = await fetch(new URL("/api/checkout-session", PELARGO_API), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pelargo-merchant-key": PELARGO_MERCHANT_KEY,
    },
    body: JSON.stringify({
      orderId: order.id,
      amount: order.amount,
      amountAtomic: order.amountAtomic,
      destinationAsset: order.destinationAsset,
      destinationSymbol: order.destinationSymbol,
      destinationNetwork: order.destinationNetwork,
      recipient: order.recipient,
      expiresInSeconds: 900,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Pelargo session request failed: ${response.status}`);
  }
  return payload as {
    token: string;
    session: {
      merchantName: string;
      orderId: string;
      amount: string;
      destinationAsset: string;
      destinationSymbol: string;
      destinationNetwork: string;
      recipient: string;
      expiresAt: string;
    };
  };
}
```

Expose this through an authenticated route on your own application, for example `POST /api/pelargo/checkout-session`. That route should:

1. Authenticate the buyer or validate the server-side cart/order context.
2. Load the order from your database. Do not trust amount or recipient values sent by the browser.
3. Resolve the destination asset and recipient from merchant configuration.
4. Calculate `amountAtomic` using the destination asset's actual decimals. Do not use floating-point arithmetic for token conversion.
5. Call `createPelargoSession` server-to-server.
6. Return only the Pelargo session token and the public session fields needed by the widget.

Apply your own CSRF protection, authorization and rate limiting to this merchant route.

## 2. Buyer page: mount the checkout button

Load the embed bundle from the Pelargo deployment you have verified. Request a session from your own merchant backend, then create the custom element with the returned session fields.

```html
<script type="module" src="https://YOUR_VERIFIED_PELARGO_HOST/pelargo.js"></script>
<div id="pelargo-checkout-slot"></div>
<script type="module">
  const response = await fetch("/api/pelargo/checkout-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: "ORDER-123" })
  });

  if (!response.ok) {
    throw new Error("Unable to initialize checkout");
  }

  const { token, session } = await response.json();
  const checkout = document.createElement("pelargo-checkout");

  checkout.setAttribute("merchant-name", session.merchantName);
  checkout.setAttribute("amount", session.amount);
  checkout.setAttribute("order-id", session.orderId);
  checkout.setAttribute("destination-asset", session.destinationAsset);
  checkout.setAttribute("destination-symbol", session.destinationSymbol);
  checkout.setAttribute("destination-network", session.destinationNetwork);
  checkout.setAttribute("recipient", session.recipient);
  checkout.setAttribute("session-token", token);
  checkout.setAttribute("button-label", "Pay with crypto");

  document.querySelector("#pelargo-checkout-slot").append(checkout);
</script>
```

The element renders a **Pay with crypto** button. Clicking it opens checkout in an isolated modal; on narrow screens the modal becomes a bottom sheet. The custom element requires a session token. Set the attributes before appending it to the page.

The session token is a short-lived bearer credential. It is visible to the buyer's browser by design, so scope it to one order, protect it from unnecessary logging, and do not store or reuse it. Current default expiry is 15 minutes; the API permits 60–1800 seconds.

## 3. Current API contract

### `POST /api/checkout-session`

Server-to-server only. Requires `X-Pelargo-Merchant-Key`.

Required JSON fields:

- `orderId`
- `amount` (positive decimal string)
- `amountAtomic` (positive integer string in destination asset base units)
- `destinationAsset` (exact supported asset ID)
- `destinationSymbol`
- `destinationNetwork`
- `recipient`

Optional: `expiresInSeconds` (60–1800; default 900).

Returns HTTP 201 with `token` and public `session` claims. Duplicate order IDs for the same merchant return HTTP 409.

### `GET /api/payment-status?orderId=...`

Merchant-authenticated status refresh. Requires `X-Pelargo-Merchant-Key`. Pelargo resolves the order within that merchant, polls 1Click using the committed deposit address and optional memo, and stores the provider status. Non-terminal provider states may advance the internal payment lifecycle. A provider `SUCCESS` is only a candidate. For NEAR mainnet NEP-141 destinations, Pelargo resolves the transaction signer through FastNear, verifies successful execution and an exact NEP-141 transfer event through NEAR RPC at finality, then persists matching evidence before reporting `settled`. Other networks and token standards remain unverified and fail closed. This verifier has mocked integration coverage only; live provider/indexer/RPC compatibility has not been validated.

### `GET /api/order?orderId=...`

Merchant-authenticated lookup of one order belonging to the authenticated merchant. Requires `X-Pelargo-Merchant-Key`. Returns the stored order ID, atomic amount, destination asset, recipient, current database status, creation time and expiry time. An order belonging to another merchant returns 404. The endpoint returns the persisted lifecycle state. A `paid` order is only written by the settlement evidence trigger after a verified NEAR transfer; live-chain operation remains unvalidated.

### `POST /api/quote`

The widget sends the signed `sessionToken` with a dry `EXACT_OUTPUT` quote. Pelargo checks the token signature, active D1 session record, exact destination asset, recipient and amount. The session must be backed by configured D1 storage.

The current widget requests dry quotes only. A dry quote is a preview, not a payment instruction or proof of payment.

## 4. Deployment prerequisites and limitations

Before testing this flow, the target Cloudflare Pages environment must have:

- D1 binding named `DB`, with migrations `0001` through `0007` applied in numerical order.
- `ORDER_SESSION_SECRET` set to a high-entropy secret of at least 32 characters.
- A merchant provisioned through the operator-only `POST /api/merchant` endpoint.
- The merchant API key stored only in the merchant server's secret manager.

The embed bundle and API must be deployed from the same Pelargo build because the embed derives its API origin from the loaded script URL.

This does not yet provide self-serve merchant signup, API-key rotation, production rate limiting, merchant webhooks or live-validated settlement operations. The current verifier supports NEAR mainnet NEP-141 only. Optional verifier settings are `NEAR_RPC_URL`, `NEAR_TX_INDEXER_URL` and `NEAR_INDEXER_API_KEY`; defaults use the public NEAR mainnet RPC and FastNear mainnet transaction indexer. The indexer resolves the transaction signer; NEAR RPC supplies execution/finality evidence. All external calls still require live validation and operational controls. Keep mainnet deposits disabled. Do not use this prototype to collect real customer funds.
