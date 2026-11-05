import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Clock3, LoaderCircle, RefreshCw } from "lucide-react";

type Token = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
};

type QuoteResponse = {
  correlationId?: string;
  quote?: {
    amountIn?: string;
    amountInFormatted?: string;
    amountInUsd?: string;
    amountOut?: string;
    amountOutFormatted?: string;
    amountOutUsd?: string;
    minAmountIn?: string;
    maxAmountIn?: string;
    deadline?: string;
    timeEstimate?: number;
    depositAddress?: string;
    depositMemo?: string | null;
  };
  message?: string;
  error?: string;
};

export type PelargoCheckoutProps = {
  merchantName?: string;
  destinationSymbol: string;
  destinationNetwork: string;
  recipient: string;
  orderId: string;
  destinationAssetId?: string;
  amount?: string;
  apiBaseUrl?: string;
  fixedAmount?: boolean;
  sessionToken?: string;
};

const NETWORK_ALIASES: Record<string, string[]> = {
  base: ["base"],
  ethereum: ["eth", "ethereum"],
  arbitrum: ["arb", "arbitrum"],
  near: ["near"],
  solana: ["sol", "solana"],
  bitcoin: ["btc", "bitcoin"],
  bnb: ["bsc", "bnb"],
  polygon: ["pol", "polygon"],
};

function toAtomicUnits(value: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) {
    throw new Error("Enter a valid positive amount.");
  }
  const [whole, fraction = ""] = value.trim().split(".");
  if (fraction.length > decimals) {
    throw new Error(`This asset supports at most ${decimals} decimal places.`);
  }
  const atomic = BigInt(whole) * (10n ** BigInt(decimals)) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (atomic <= 0n) throw new Error("Amount must be greater than zero.");
  return atomic.toString();
}

function formatExpiry(value?: string) {
  if (!value) return "Not supplied";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

export function PelargoCheckout({
  merchantName = "Merchant",
  destinationSymbol,
  destinationNetwork,
  recipient,
  orderId,
  destinationAssetId,
  amount: initialAmount = "25.00",
  apiBaseUrl = "",
  fixedAmount = false,
  sessionToken = "",
}: PelargoCheckoutProps) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [sourceAssetId, setSourceAssetId] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [amount, setAmount] = useState(initialAmount);

  useEffect(() => {
    setAmount(initialAmount);
    clearQuote();
  }, [initialAmount]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<QuoteResponse["quote"] | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const [requestedAt, setRequestedAt] = useState("");
  const [committing, setCommitting] = useState(false);
  const [paymentInstructions, setPaymentInstructions] = useState<{ address: string; memo?: string | null; quoteId: string } | null>(null);
  const quoteRequestRef = useRef(0);

  function clearQuote() {
    quoteRequestRef.current += 1;
    setQuote(null);
    setQuoteId("");
    setRequestedAt("");
    setPaymentInstructions(null);
    setQuoting(false);
    setCommitting(false);
  }

  useEffect(() => {
    clearQuote();
  }, [destinationSymbol, destinationNetwork, recipient, orderId]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoadingTokens(true);
      setError("");
      try {
        const response = await fetch(apiUrl("/api/tokens"), {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || payload?.error || `Token service returned HTTP ${response.status}`);
        const list = Array.isArray(payload) ? payload : payload?.tokens;
        if (!Array.isArray(list)) throw new Error("Unexpected token service response.");
        const valid = list.filter((token: any) =>
          token && typeof token.assetId === "string" &&
          typeof token.symbol === "string" &&
          typeof token.blockchain === "string" &&
          Number.isInteger(token.decimals)
        ) as Token[];
        if (!valid.length) throw new Error("No supported assets were returned.");
        setTokens(valid);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Unable to load supported assets.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingTokens(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const networkAliases = NETWORK_ALIASES[destinationNetwork.toLowerCase()] ?? [destinationNetwork.toLowerCase()];
  const destinationToken = useMemo(
    () => tokens.find((token) => destinationAssetId
      ? token.assetId === destinationAssetId
      : token.symbol.toLowerCase() === destinationSymbol.toLowerCase() &&
        networkAliases.includes(token.blockchain.toLowerCase())
    ),
    [tokens, destinationAssetId, destinationSymbol, networkAliases.join("|")]
  );

  const apiUrl = (path: string) => apiBaseUrl
    ? new URL(path, apiBaseUrl.endsWith("/") ? apiBaseUrl : apiBaseUrl + "/").toString()
    : path;

  const sourceTokens = useMemo(
    () => tokens.filter((token) => token.assetId !== destinationToken?.assetId)
      .sort((a, b) => a.blockchain.localeCompare(b.blockchain) || a.symbol.localeCompare(b.symbol)),
    [tokens, destinationToken]
  );

  useEffect(() => {
    if (!sourceTokens.length) return;
    if (!sourceTokens.some((token) => token.assetId === sourceAssetId)) {
      setSourceAssetId(sourceTokens[0].assetId);
    }
  }, [sourceTokens, sourceAssetId]);

  const selectedSource = sourceTokens.find((token) => token.assetId === sourceAssetId);

  async function requestDryQuote() {
    setError("");
    clearQuote();
    if (!sessionToken) {
      setError("This checkout has no signed merchant order session. Ask the merchant to initialize the checkout session.");
      return;
    }
    if (!destinationToken) {
      setError(`The selected settlement asset ${destinationSymbol} on ${destinationNetwork} is not in the current NEAR Intents token list.`);
      return;
    }
    if (!recipient.trim()) {
      setError("The merchant receiving address is not configured.");
      return;
    }
    if (!selectedSource) {
      setError("Select a supported source asset.");
      return;
    }
    if (!refundTo.trim()) {
      setError("Enter a refund address for the selected source network.");
      return;
    }

    let outputAmount: string;
    try {
      outputAmount = toAtomicUnits(amount, destinationToken.decimals);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid amount.");
      return;
    }

    setQuoting(true);
    const requestId = ++quoteRequestRef.current;
    try {
      const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const response = await fetch(apiUrl("/api/quote"), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          dry: true,
          sessionToken,
          swapType: "EXACT_OUTPUT",
          originAsset: selectedSource.assetId,
          destinationAsset: destinationToken.assetId,
          amount: outputAmount,
          recipient: recipient.trim(),
          refundTo: refundTo.trim(),
          depositType: "ORIGIN_CHAIN",
          refundType: "ORIGIN_CHAIN",
          recipientType: "DESTINATION_CHAIN",
          slippageTolerance: 100,
          deadline,
        }),
      });
      const payload = await response.json() as QuoteResponse;
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || `Quote service returned HTTP ${response.status}`);
      }
      if (!payload.quote || typeof payload.quote.amountIn !== "string" || typeof payload.quote.amountOut !== "string") {
        throw new Error("The quote service response did not include the expected amount fields.");
      }
      if (requestId !== quoteRequestRef.current) return;
      setQuote(payload.quote);
      setQuoteId(payload.correlationId ?? "");
      setRequestedAt(new Date().toLocaleTimeString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to request a quote.");
    } finally {
      if (requestId === quoteRequestRef.current) setQuoting(false);
    }
  }

  async function createDepositInstructions() {
    if (!quote || !sessionToken || !selectedSource || !destinationToken) return;
    if (paymentInstructions) return;
    const confirmed = window.confirm(
      "Create a real Tidepool testnet deposit quote? This creates payment instructions. It does not send funds. Only send testnet tokens to the address shown."
    );
    if (!confirmed) return;

    setError("");
    setCommitting(true);
    try {
      const outputAmount = toAtomicUnits(amount, destinationToken.decimals);
      const response = await fetch(apiUrl("/api/quote"), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          dry: false,
          sessionToken,
          swapType: "EXACT_OUTPUT",
          originAsset: selectedSource.assetId,
          destinationAsset: destinationToken.assetId,
          amount: outputAmount,
          recipient: recipient.trim(),
          refundTo: refundTo.trim(),
          depositType: "ORIGIN_CHAIN",
          refundType: "ORIGIN_CHAIN",
          recipientType: "DESTINATION_CHAIN",
          slippageTolerance: 100,
          deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }),
      });
      const payload = await response.json() as QuoteResponse;
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || `Unable to create deposit instructions (HTTP ${response.status}).`);
      }
      const address = payload.quote?.depositAddress;
      const committedQuoteId = payload.correlationId;
      if (typeof address !== "string" || !address.trim() ||
          typeof committedQuoteId !== "string" || !committedQuoteId.trim()) {
        throw new Error("The provider response did not contain a usable deposit address and quote reference. Do not retry this order; contact the merchant.");
      }
      setPaymentInstructions({
        address,
        memo: payload.quote?.depositMemo,
        quoteId: committedQuoteId,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create deposit instructions.");
    } finally {
      setCommitting(false);
    }
  }

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Clipboard access failed. Select and copy the deposit details manually.");
    }
  }

  const configReady = Boolean(destinationToken && recipient.trim());

  return (
    <section className="pelargo-checkout" aria-label="Pelargo checkout quote preview">
      <div className="pelargo-checkout-head">
        <div>
          <span className="pelargo-kicker">POWERED BY NEAR INTENTS</span>
          <h2>Pay {merchantName}</h2>
          <p>Choose a supported asset from a network you can pay on.</p>
        </div>
        <span className="pelargo-order">Order {orderId}</span>
      </div>

      {!configReady && !loadingTokens && (
        <div className="pelargo-warning"><AlertCircle size={15} /> Merchant destination is incomplete or not present in the supported token list.</div>
      )}

      <div className="pelargo-amount-field">
        <label htmlFor="pelargo-amount">Amount to receive</label>
        <div>
          <input id="pelargo-amount" inputMode="decimal" value={amount} readOnly={fixedAmount} onChange={(event) => { setAmount(event.target.value); clearQuote(); }} />
          <span>{destinationToken?.symbol ?? destinationSymbol}</span>
        </div>
        <small>{destinationToken ? `Settlement on ${destinationToken.blockchain}` : `Settlement network: ${destinationNetwork}`}</small>
      </div>

      <label className="pelargo-field-label" htmlFor="pelargo-source">You pay with</label>
      <select id="pelargo-source" className="pelargo-select" value={sourceAssetId} onChange={(event) => { setSourceAssetId(event.target.value); clearQuote(); }} disabled={loadingTokens || sourceTokens.length === 0}>
        {sourceTokens.map((token) => (
          <option value={token.assetId} key={token.assetId}>{token.symbol} · {token.blockchain}</option>
        ))}
      </select>

      <label className="pelargo-field-label" htmlFor="pelargo-refund">Your refund address on {selectedSource?.blockchain ?? "the source network"}</label>
      <input id="pelargo-refund" className="pelargo-text-input" value={refundTo} onChange={(event) => { setRefundTo(event.target.value); clearQuote(); }} placeholder="Wallet address for refunds" autoComplete="off" />

      <button className="pelargo-quote-button" onClick={requestDryQuote} disabled={loadingTokens || quoting || !configReady || !selectedSource}>
        {quoting ? <><LoaderCircle size={15} className="pelargo-spin" /> Getting quote…</> : <>Preview payment <ArrowRight size={15} /></>}
      </button>

      {loadingTokens && <div className="pelargo-muted"><RefreshCw size={14} className="pelargo-spin" /> Loading supported payment assets…</div>}
      {error && <div className="pelargo-error" role="alert"><AlertCircle size={15} />{error}</div>}

      {quote && (
        <div className="pelargo-quote-result" aria-live="polite">
          <div className="pelargo-quote-label">LIVE QUOTE PREVIEW <span>DRY RUN</span></div>
          <div className="pelargo-quote-amount"><strong>{quote.amountInFormatted ?? quote.amountIn}</strong><span>{selectedSource?.symbol}</span></div>
          <div className="pelargo-route-line"><span>{selectedSource?.blockchain}</span><ArrowRight size={14} /><span>{destinationToken?.blockchain}</span></div>
          <div className="pelargo-quote-detail"><span>Merchant receives</span><strong>{quote.amountOutFormatted ?? quote.amountOut} {destinationToken?.symbol}</strong></div>
          {quote.amountInUsd && <div className="pelargo-quote-detail"><span>Estimated source value</span><strong>${quote.amountInUsd}</strong></div>}
          {quote.timeEstimate !== undefined && <div className="pelargo-quote-detail"><span>Estimated execution</span><strong>{Math.ceil(quote.timeEstimate / 60)} min</strong></div>}
          <div className="pelargo-quote-detail"><span>Quote deadline</span><strong><Clock3 size={12} /> {formatExpiry(quote.deadline)}</strong></div>
          <p>This is a quote preview only. No deposit address has been created and no payment has been initiated.</p>
          {quoteId && <small>Quote reference: {quoteId}</small>}
          {requestedAt && <small>Requested at {requestedAt}</small>}
        </div>
      )}
      {paymentInstructions && (
        <div className="pelargo-quote-result" aria-live="polite">
          <div className="pelargo-quote-label">TESTNET DEPOSIT INSTRUCTIONS <span>REAL TESTNET QUOTE</span></div>
          <strong>Send {quote?.amountInFormatted ?? quote?.amountIn} {selectedSource?.symbol} on {selectedSource?.blockchain}</strong>
          <p>Send only the exact source asset and amount shown, using the selected source network. Do not send funds on a different network.</p>
          <div className="pelargo-quote-detail"><span>Deposit address</span><button type="button" onClick={() => copyValue(paymentInstructions.address)}>Copy address</button></div>
          <div className="pelargo-deposit-address">{paymentInstructions.address}</div>
          {paymentInstructions.memo && (
            <>
              <div className="pelargo-quote-detail"><span>Deposit memo / tag</span><button type="button" onClick={() => copyValue(paymentInstructions.memo!)}>Copy memo</button></div>
              <div className="pelargo-deposit-address">{paymentInstructions.memo}</div>
            </>
          )}
          <div className="pelargo-quote-detail"><span>Provider quote reference</span><strong>{paymentInstructions.quoteId}</strong></div>
          <p>Creating these instructions did not send funds. After you send the testnet deposit, the merchant's server must verify the provider result and destination-chain settlement. Do not treat a wallet send or provider success alone as proof that the order is paid.</p>
        </div>
      )}
      <div className="pelargo-checkout-foot">Merchant destination: {destinationToken?.symbol ?? destinationSymbol} · {recipient ? `${recipient.slice(0, 7)}…${recipient.slice(-5)}` : "Not configured"}</div>
    </section>
  );
}
